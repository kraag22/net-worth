class Fixer {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.base = 'CZK'
    this.prefix = 'http://data.fixer.io/api'
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

  getRates(apiObj, logger, currencies, date) {
    currencies.push(this.base)
    const api = date ? date : 'latest'
    const symbols = currencies.join(',')
    const url = `${this.prefix}/${api}?access_key=${this.apiKey}`
      + `&base=EUR&symbols=${symbols}&format=1`
    return apiObj.get(url)
      .then(result => this.changeBase(result.data.rates, this.base))
      .catch(e => logger.error('fixer API call failed', e))
  }
}

exports.Fixer = Fixer
