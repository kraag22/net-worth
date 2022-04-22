const axios = require('axios')
const parse = require('./parse_api.js')
const storage = require('./storage.js')
const realityData = require('./reality/data.js')
const singleStock = require('./single_stock.js')
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
  await storage.insertStocks(db, portfolio)
  await exports.computeAndStoreOrdersData(db)
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

exports.computeAndStoreOrdersData = async db => {
  const cashFunds = c.CASH_FUNDS.join(',')

  await storage.run(db, `delete from ${storage.EVENTS_TABLE}`)

  const sql = `insert into ${storage.EVENTS_TABLE} select s.id, s.name, ` +
    'round(s.price * s.size * s.ratio) as value, ' +
    's.price, s.size, s.ratio, s.currency, ' +
    `strftime('%Y-%m-%d', s.created_at) as date from ` +
    '(select id, name, min(created_at) as first_created_at ' +
    `from ${storage.STOCKS_TABLE} group by id, size) as sm ` +
    `left join ${storage.STOCKS_TABLE} as s ` +
    'on sm.id=s.id and sm.first_created_at=s.created_at ' +
    `where s.id not in (${cashFunds}) order by s.created_at`
  return storage.run(db, sql)
}

exports.getOrdersData = async db => {
  const sql = `select * from ${storage.EVENTS_TABLE} order by date`
  return storage.call(db, sql)
}

// avg currency rate to CZK thu orders
exports.getAvgCurrencyRatio = (lastOrder, size, ratio) => {
  let added = size - lastOrder.size
  if (added > 0) {
    avgRatio = (lastOrder.size * lastOrder.avgRatio + added * ratio) / size
  } else {
    avgRatio = lastOrder.avgRatio
  }
  return avgRatio
}

exports.getOrders = data => {
  let ids = new Set(data.map(item => item.id))
  const orders = {}

  ids.forEach(id =>
    orders[id] = {
      id: id,
      size: 0,
      price: 0,
      avgRatio: 0
  })
  const timeline = {}
  let lastOrder = 0

  data.forEach(item => {
    let priceAdded = (item.size - orders[item.id].size) * item.price * item.ratio

    orders[item.id] = {
      size: item.size,
      id: item.id,
      name: item.name,
      price: orders[item.id].price + priceAdded,
      currency: item.currency,
      avgRatio: exports.getAvgCurrencyRatio(orders[item.id], item.size, item.ratio)
    }
    if (timeline[item.date] === undefined) {
      timeline[item.date] = lastOrder
    }
    timeline[item.date] += Math.round(priceAdded)
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
  sql += `from stocks where created_at=(select created_at from stocks order `
  sql += `by created_at desc limit 1)`
  return storage.call(db, sql)
}

exports.getStocksBalance = async (db, orders) => {
  const result = []
  const stocks = await exports.getStocksNewest(db)

  Object.entries(orders).forEach(item => {
    const values = item[1]
    const name = values.name.substring(0, c.NAME_MAX_LENGTH)
    const stock = stocks.find(item => item.id === values.id)

    if (stock) {
      result.push({id: values.id, name: name.trim(), price: stock.price,
        currency: values.currency,  balance: Math.round(stock.price - values.price)})
    }
  })

  return result.sort((a, b) => b.balance - a.balance)
}

exports.sumStocksBalanceByCurrency = stocksBalance => {
  const result = {}
  stocksBalance.forEach(item => {
    if (result[item.currency]) {
      result[item.currency].balance += item.balance
      result[item.currency].price += item.price
    } else {
      result[item.currency] = {
        balance: item.balance,
        price: item.price,
        currency: item.currency
      }
    }
  })
  const list = Object.entries(result).map(item => item[1])
  return list.map(item => {
    item.percents = (100 * (item.balance + item.price) / item.price) - 100
    return item
  })
}

exports.getDailyData = async db => {
  const sql = '' +
    `select d.date, a.value, u.usd_value, e.eur_value, ` +
    `  a.value - u.usd_value - e.eur_value as other_value, ` +
    `  a.sum_balance, u.usd_balance, e.eur_balance ` +
    `from ` +
    `(select date from ${storage.STOCKS_DAILY_TABLE} group by date order by date) as d ` +
    `left join ` +
    `    (select round(sum(last_value)) as value, date, ` +
    `    round(sum(currency_balance)) as sum_balance ` +
    `    from ${storage.STOCKS_DAILY_TABLE} ` +
    `    group by date) as a ` +
    `    on d.date=a.date ` +
    `left join ` +
    `    (select round(sum(currency_balance)) as usd_balance, date, ` +
    `    round(sum(last_value)) as usd_value ` +
    `    from ${storage.STOCKS_DAILY_TABLE} ` +
    `    where currency='USD' ` +
    `    group by date ` +
    `    ) as u ` +
    `    on d.date=u.date ` +
    `left join ` +
    `    (select round(sum(currency_balance)) as eur_balance, date, ` +
    `    round(sum(last_value)) as eur_value ` +
    `    from ${storage.STOCKS_DAILY_TABLE} ` +
    `    where currency='EUR' ` +
    `    group by date ` +
    `    ) as e ` +
    `    on d.date=e.date `

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
  logger.info(orders)
  ret.timeline = timeline
  ret.stocksBalance = await exports.getStocksBalance(db, orders)
  ret.sumStocksBalanceByCurrency = exports.sumStocksBalanceByCurrency(ret.stocksBalance)
  ret.totalOrder = exports.getTotalOrder(ret.timeline)
  ret.realityData = await realityData.getRealityData(db)
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

  const sumByCurrencyData = []
  const balanceData = []
  const currencyBalanceData = []
  let invested = c.INITIAL_INVESTMENT

  data.daily.forEach(item => {
    if (data.timeline[item.date]) {
      invested = data.timeline[item.date]
    }
    const date = exports.parseDate(item.date)
    sumByCurrencyData.push({
      date: date,
      current: item.value,
      usd_value: item.usd_value,
      eur_value: item.eur_value,
      other_value: item.other_value,
      invested: invested
    })

    balanceData.push({
      date: date,
      balance: Math.round(item.value - invested)
    })

    currencyBalanceData.push({
      date: date,
      balance: item.sum_balance,
      usd_balance: item.usd_balance,
      eur_balance: item.eur_balance
    })
  })

  ret.sumByCurrencyData = JSON.stringify(sumByCurrencyData)
  ret.balanceData = JSON.stringify(balanceData)
  ret.currencyBalanceData = JSON.stringify(currencyBalanceData)
  // ret.todayTitle = `${data.todaySum.lastSum} (${data.todaySum.balance})`
  // ret.balanceTodayData = JSON.stringify(exports.parseTodayData(data.today))
  ret.balanceByStockData = JSON.stringify(data.stocksBalance)
  ret.sumStocksBalanceByCurrency = JSON.stringify(data.sumStocksBalanceByCurrency)
  ret.realityData  = JSON.stringify(data.realityData)

  return ret
}

exports.getSingleData = async (db, action) => {
  let data = []
  switch(action) {
    case 'single_stock':
      data = singleStock.getStock(db, 13200994)
      break;
  }
  return data
}

exports.getImportStatus = async (db, now) => {
  const today = exports.getDateString(now)
  const sql = `select * from stocks where created_at like '${today}%' ` +
              'order by created_at desc limit 100'
  const data = await storage.call(db, sql)

  const ret = {}
  ret.import_status = (data?.length > 0) ? 'OK' : 'FAILED'

  if (now.getHours() < 1) {
    // after midnight is everything OK :)
    ret.import_status = 'OK'
  }
  return ret
}
