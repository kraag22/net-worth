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
