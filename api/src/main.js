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
      dateFormat = '%Y-%m-00'
      break
    case 'hourly':
      dateFormat = '%Y-%m-%dT%H:00:00'
      break
    default:
      dateFormat = '%Y-%m-%d'
      break
  }

  let lastSql = `(select value from stocks as s2 where `
  lastSql += `strftime('${dateFormat}', s2.created_at)=strftime('${dateFormat}', s1.created_at) `
  lastSql += `and s2.id=s1.id order by s2.created_at desc limit 1)`

  let sql = `select id, min(value) as min_value, max(value) as max_value,`
  sql += `name, strftime('${dateFormat}', created_at) as created, `
  sql += `${lastSql} as last_value `
  sql += `from stocks as s1 group by strftime('${dateFormat}', created_at), id`
  const result = await storage.call(db, sql)
  return result
}
