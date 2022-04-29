const portfolio = require('./portfolio.json')
const products = require('./products.json')

const mockDegiro = {}

mockDegiro.login = () =>
  new Promise((resolve, reject) => {
    resolve({})
  })

mockDegiro.getPortfolio = () =>
  new Promise((resolve, reject) => {
    resolve(portfolio)
  })

mockDegiro.getProductsByIds = () =>
  new Promise((resolve, reject) => {
    resolve(products)
  })

exports.mockDegiro = mockDegiro
