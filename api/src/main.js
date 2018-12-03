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
  let dateFormat = ''
  switch(groupBy) {
    case 'monthly':
      dateFormat = '%Y-%m-00T00:00:00'
      break
    case 'hourly':
      dateFormat = '%Y-%m-%dT%H:00:00'
      break
    default:
      dateFormat = '%Y-%m-%dT00:00:00'
      break
  }

  let sql = `select id, min(value) as min_value, max(value) as max_value,`
  sql += `name, strftime('${dateFormat}', created_at) as created `
  sql += `from stocks group by strftime('${dateFormat}', created_at), id`
  const result = await storage.call(db, sql)
  return result
}
