const axios = require('axios')
const parse = require('./parse_api.js')
const storage = require('./storage.js')
const c = require('./constants')

exports.getPortfolio = async (degiro, fixer) => {
  await degiro.login()
  const data = await degiro.getPortfolio()
  const portfolio = parse.getPortfolio(data)
  const ids = parse.getIds(portfolio)
  const products = await degiro.getProductsByIds(ids)
  parse.addMetaToPortfolio(portfolio, products)

  const currencies = parse.getCurrencies(portfolio)
  const rates = await fixer.getRates(axios, currencies)
  parse.addCurrencyRateToPortfolio(portfolio, rates)
  return portfolio
}

exports.importPortfolio = async (degiro, db, fixer) => {
  const portfolio = await exports.getPortfolio(degiro, fixer)
  await storage.insert(db, portfolio)
}

exports.groupPortfolio = async (db, groupBy) => {
  let group = ''
  switch(groupBy) {
    case 'monthly':
      group = groupBy
      break
    case 'hourly':
      group = groupBy
      break
    default:
      group = 'daily'
      break
  }

  return storage.call(db, `select * from stocks_${group}`)
}

exports.getDateString = now => {
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${yyyy}-${mm}-${dd}`
}

exports.getTodaysData = async db => {
  const today = exports.getDateString(new Date())

  const sql = 'select id, round(max_value) as value, name, created from stocks_hourly ' +
              `where created like '${today}%'` +
              'order by created'
  const data = await storage.call(db, sql)
  const ret = {}
  data.forEach(row => {
    if (ret[row.id]) {
      ret[row.id].values.push({value: row.value, created: row.created})
    } else {
      ret[row.id] = {
        name: row.name,
        id: row.id,
        values: [{value: row.value, created: row.created}]}
    }
  })
  return Object.values(ret)
}

exports.sumTodaysData = todaysData => {
  let no
  const result = []
  if (todaysData[0] && todaysData[0].values) {
    no = todaysData[0].values.length
  } else {
    no = 0
  }
  for(let i = 0; i < no; i++) {
    result.push(0)
  }

  todaysData.forEach(item => {
    for(let j = 0; j < no; j++) {
      result[j] += item.values[j].value
    }
  })

  return result
}

exports.getOrdersData = async db => {
  const cashFunds = c.CASH_FUNDS.join(',')

  const sql = 'select s.id, s.name, round(s.price * s.size * s.ratio) as value, ' +
    's.price, s.size, s.ratio, ' +
    `strftime('%Y-%m-%d', s.created_at) as date from ` +
    '(select id, name, min(created_at) as first_created_at ' +
    'from stocks group by id, size) as sm left join stocks as s ' +
    'on sm.id=s.id and sm.first_created_at=s.created_at ' +
    `where s.id not in (${cashFunds}) order by s.created_at`
  return storage.call(db, sql)
}

exports.getOrdersTimeline = data => {
  const orders = {}
  const timeline = {}
  let lastOrder = 0
  data.forEach(item => {
    let added
    if (orders[item.name]) {
      added = item.size - orders[item.name]

    } else {
      added = item.size
    }
    orders[item.name] = item.size

    if (timeline[item.date] === undefined) {
      timeline[item.date] = lastOrder
    }
    timeline[item.date] += Math.round(added * item.price * item.ratio)
    lastOrder = timeline[item.date]
  })
  return timeline
}

exports.getTotalOrder = orderData => {
  const lastDate = Object.keys(orderData).pop()
  return Math.round(orderData[lastDate])
}

exports.getDailyData = async db => {
  const sql = 'select round(sum(last_value)) as value, date ' +
    `from ${storage.STOCKS_DAILY_TABLE} group by date order by date`
  return storage.call(db, sql)
}

exports.fillMissingRates = async (db, fixer) => {
  const sql = `select distinct(strftime('%Y-%m-%d', created_at)) as date ` +
    'from stocks where ratio is null'
  const dates = await storage.call(db, sql)
  const sql2 = 'select distinct(currency) from stocks where ratio is null'
  let currencies = await storage.call(db, sql2)
  currencies = currencies.map(item => item.currency)

  for (const item of Object.values(dates)) {
    const rates = await fixer.getRates(axios, currencies, item.date)
    await storage.updateCurrencies(db, rates, item.date)
  }

  return dates.length
}

exports.getAllData = async db => {
  const ret = {}

  ret.daily = await exports.getDailyData(db)
  ret.today = await exports.getTodaysData(db)
  ret.todaySum = exports.sumTodaysData(ret.today)
  ret.orders = await exports.getOrdersData(db)
  ret.timeline = exports.getOrdersTimeline(ret.orders)
  ret.totalOrder = exports.getTotalOrder(ret.timeline)
  return ret
}

exports.parseDate = str => {
  return new Date(Date.parse(str))
}

exports.getGraphData = async db => {
  const ret = {}
  const data = await exports.getAllData(db)

  const xyChart = []
  const balanceChart = []
  let invested = 65000

  data.daily.forEach(item => {
    if (data.timeline[item.date]) {
      invested = data.timeline[item.date]
    }
    const date = exports.parseDate(item.date)
    xyChart.push({
      date: date,
      current: item.value,
      invested: invested
    })

    balanceChart.push({
      date: date,
      balance: Math.round(item.value - invested)
    })
  })

  data.xyChart = JSON.stringify(xyChart)
  data.balanceChart = JSON.stringify(balanceChart)
  // TODO - return only stringified data
  return data
}
