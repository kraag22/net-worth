const portfolio = require('./portfolio.json')

class MockFixer {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.base = 'CZK'
  }

  getRates() {
    return new Promise((resolve, reject) => {
      resolve(portfolio)
    })
  }
}

exports.MockFixer = MockFixer
