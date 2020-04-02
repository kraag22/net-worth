const axios = require('axios')
const parse = require('./parse_api.js')
const storage = require('./storage.js')
const {logger} = require('../logs.js')
const c = require('./constants')

exports.getPortfolio = async (degiro, fixer) => {
  await degiro.login()
  const data = await degiro.getPortfolio()
  const portfolio = parse.getPortfolio(data)
  const ids = parse.getIds(portfolio)
  const products = await degiro.getProductsByIds(ids)
  parse.addMetaToPortfolio(portfolio, products)

  const currencies = parse.getCurrencies(portfolio)
  const rates = await fixer.getRates(axios, logger, currencies)
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
  let fistSum = 0
  let lastSum = 0
  let balance = 0

  todaysData.forEach(item => {
    fistSum += (item.values[0]) ? item.values[0].value : 0
    const last = item.values.length - 1
    lastSum += (item.values[last]) ? item.values[last].value : 0
  })

  balance = lastSum - fistSum
  balance = (balance > 0) ? `+${balance}` : `${balance}`

  return {lastSum, balance}
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

exports.getOrders = data => {
  const orders = {}
  const timeline = {}
  let lastOrder = 0
  data.forEach(item => {
    let added, price
    if (orders[item.name]) {
      added = item.size - orders[item.name].size
      lastPrice = orders[item.name].price
    } else {
      added = item.size
      lastPrice = 0
    }
    orders[item.name] = {
      size: item.size,
      id: item.id,
      price: lastPrice + added * item.price * item.ratio
    }
    if (timeline[item.date] === undefined) {
      timeline[item.date] = lastOrder
    }
    timeline[item.date] += Math.round(added * item.price * item.ratio)
    lastOrder = timeline[item.date]
  })
  return {timeline, orders}
}

exports.getTotalOrder = orderData => {
  const lastDate = Object.keys(orderData).pop()
  return Math.round(orderData[lastDate])
}

exports.getStocksNewest = async db => {
  let sql = `select round(price * size * ratio) as price, id, size, name `
  sql += `from stocks where strftime('%Y-%m-%dT%H:%M:%S', created_at)=`
  sql += `(select strftime('%Y-%m-%dT%H:%M:%S', created_at) from stocks order `
  sql += `by created_at desc limit 1)`
  return storage.call(db, sql)
}

exports.getStocksBalance = async (db, orders) => {
  const result = []
  const stocks = await exports.getStocksNewest(db)

  Object.entries(orders).forEach(item => {
    const name = item[0].substring(0, c.NAME_MAX_LENGTH)
    const values = item[1]
    const stock = stocks.find(item => item.id === values.id)

    if (stock) {
      result.push({id: values.id, name: name, price: stock.price,
        balance: Math.round(stock.price - values.price)})
    }
  })

  return result.sort((a, b) => b.balance - a.balance)
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
    const rates = await fixer.getRates(axios, logger, currencies, item.date)
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
  const {timeline, orders} = exports.getOrders(ret.orders)
  ret.timeline = timeline
  ret.stocksBalance = await exports.getStocksBalance(db, orders)
  ret.totalOrder = exports.getTotalOrder(ret.timeline)
  return ret
}

exports.parseDate = str => {
  return new Date(Date.parse(str))
}

exports.parseTodayData = daily => {
  const result = daily.map(item => {
    let balance = 0

    if (item.values.length > 1) {
      balance = item.values[item.values.length - 1].value - item.values[0].value
    }
    return {name: item.name.substring(0, c.NAME_MAX_LENGTH), balance}
  })

  return result.sort((a, b) => b.balance - a.balance)
}

exports.getGraphData = async db => {
  const ret = {}
  const data = await exports.getAllData(db)

  const xyChart = []
  const balanceChart = []
  let invested = c.INITIAL_INVESTMENT

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

  ret.xyChart = JSON.stringify(xyChart)
  ret.balanceChart = JSON.stringify(balanceChart)
  ret.todayTitle = `${data.todaySum.lastSum} (${data.todaySum.balance})`
  ret.todayChart = JSON.stringify(exports.parseTodayData(data.today))
  ret.stockChart = JSON.stringify(data.stocksBalance)
  return ret
}
