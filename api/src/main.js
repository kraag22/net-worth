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

  return await storage.call(db, `select * from stocks_${group}`)
}

exports.getTodaysData = async db => {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const today = `${yyyy}-${mm}-${dd}`

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

exports.getOrdersData = async db => {
  const cashFunds = c.CASH_FUNDS.join(',')

  const sql = 'select s.id, s.name, round(s.price * s.size * s.ratio) as value, ' +
    `strftime('%Y-%m-%d', s.created_at) as date from ` +
    '(select id, name, min(created_at) as first_created_at ' +
    'from stocks group by id, size) as sm left join stocks as s ' +
    'on sm.id=s.id and sm.first_created_at=s.created_at ' +
    `where s.id not in (${cashFunds}) order by s.created_at`
  return await storage.call(db, sql)
}

exports.getIndexData = async db => {
  const sql = 'select round(sum(sld.value)) as value, sd.created from stocks_daily as sd ' +
    'left join stocks_last_daily as sld on sd.id=sld.id and sd.created=sld.created ' +
    'group by sd.created order by sd.created desc'
  const data = await storage.call(db, sql)

  const ret = {}
  ret.sum = data.length > 0 ? data[0].value : 0
  ret.daily = data
  ret.today = await exports.getTodaysData(db)
  ret.orders = await exports.getOrdersData(db)
  ret.data = JSON.stringify(ret.daily)
  return ret
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
