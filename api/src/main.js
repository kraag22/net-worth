const parse = require('./parse_api.js')

exports.getPortfolio = async degiro => {
  await degiro.login()
  const data = await degiro.getPortfolio()
  const portfolio = parse.getPortfolio(data)
  const ids = parse.getIds(portfolio)
  const products = await degiro.getProductsByIds(ids)
  parse.addMetaToPorfolio(portfolio, products)
  return portfolio
}
