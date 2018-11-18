const portfolio = require('./portfolio.json')
const products = require('./products.json')

const mockDeGiro = {}

mockDeGiro.login = () => new Promise((resolve, reject) => {
  resolve({})
})

mockDeGiro.getPortfolio = () => new Promise((resolve, reject) => {
  resolve(portfolio)
})

mockDeGiro.getProductsByIds = () => new Promise((resolve, reject) => {
  resolve(products)
})

exports.mockDeGiro = mockDeGiro
