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

exports.getIndexData = async db => {
  const sql = 'select sum(last_value) as value, created from stocks_daily ' +
              'group by created order by created desc'
  const data = await storage.call(db, sql)

  const ret = {}
  ret.sum = data.length > 0 ? data[0].value : 0
  ret.daily = data
  return ret
}
