const parse = require('./parse_api.js')
const storage = require('./storage.js')

exports.getPortfolio = async degiro => {
  await degiro.login()
  const data = await degiro.getPortfolio()
  const portfolio = parse.getPortfolio(data)
  const ids = parse.getIds(portfolio)
  const products = await degiro.getProductsByIds(ids)
  parse.addMetaToPorfolio(portfolio, products)
  return portfolio
}

exports.importPortfolio = async (degiro, db) => {
  const portfolio = await exports.getPortfolio(degiro)
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
  const dd = now.getDate()
  const mm = now.getMonth() + 1
  const yyyy = now.getFullYear()
  const today = `${yyyy}-${mm}-${dd}`
  const sql = 'select id, last_value as value, name, created from stocks_hourly ' +
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

exports.getIndexData = async db => {
  const sql = 'select sum(last_value) as value, created from stocks_daily ' +
              'group by created order by created desc'
  const data = await storage.call(db, sql)

  const ret = {}
  ret.sum = data.length > 0 ? data[0].value : 0
  ret.daily = data
  ret.today = await exports.getTodaysData(db)
  return ret
}
