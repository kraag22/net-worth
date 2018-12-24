const rates = require('./rates.json')
const {Fixer} = require('../src/fixer.js')

class MockFixer {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.base = 'CZK'
  }

  getRates(apiObj, currencies, date) {
    return new Promise((resolve, reject) => {
      const fixer = new Fixer()
      resolve(fixer.changeBase(rates.rates, 'CZK'))
    })
  }
}

exports.MockFixer = MockFixer
