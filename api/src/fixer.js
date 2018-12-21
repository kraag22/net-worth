const axios = require('axios')

class Fixer {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.base = 'CZK'
    this.prefix = 'http://data.fixer.io/api/'
  }

  changeBase(rates, base) {
    const newRates = {}
    newRates['EUR'] = rates[base]
    const currencies = Object.keys(rates)
    currencies.forEach(currency => {
     newRates[currency] = rates[base] / rates[currency]
    })
    return newRates
  }

  getRates(currencies) {
    currencies.push(this.base)
    const symbols = currencies.join(',')
    const url = `${this.prefix}/latest?access_key=${this.apiKey}`
      + `&base=EUR&symbols=${symbols}&format=1`
    return axios.get(url)
      .then(result => this.changeBase(result.data.rates, this.base))
  }
}

exports.Fixer = Fixer
