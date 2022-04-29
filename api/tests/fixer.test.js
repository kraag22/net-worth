const { Fixer } = require('../src/fixer.js')
const rates = require('./rates.json')

let fixer = null

beforeAll(async () => {
  fixer = new Fixer('x')
})

describe('Fixer function', () => {
  it('changeBase() should work', async () => {
    const expected = {}
    const result = fixer.changeBase(rates.rates, 'CZK')
    expect(Object.keys(result).length).toEqual(7)
    expect(result['CZK']).toEqual(1)

    expect(Math.round(result['USD'] * 100) / 100).toEqual(22.48)
    expect(Math.round(result['EUR'] * 100) / 100).toEqual(25.79)
  })

  it('getRates() should work', async () => {
    const api = {}
    const expectedUrl =
      'http://data.fixer.io/api/2018-12-24?access_key=x&' +
      'base=EUR&symbols=EUR,USD,CZK&format=1'
    let calledUrl = ''

    api.get = (url) => {
      calledUrl = url
      return new Promise((resolve, reject) => {
        resolve({ data: rates })
      })
    }

    const result = await fixer.getRates(api, {}, ['EUR', 'USD'], '2018-12-24')
    expect(calledUrl).toBe(expectedUrl)
    expect(result['EUR']).toEqual(25.790743)
    expect(result['CZK']).toEqual(1)
    expect(Math.round(result['USD'] * 100) / 100).toEqual(22.48)
    expect(Object.keys(result).length).toEqual(7)
  })

  it('getRates should log errors', async () => {
    const logger = {}
    let calledError = ''
    logger.error = (title, e) => {
      calledError = title
    }

    const api = {}

    api.get = (url) => {
      return new Promise((resolve, reject) => {
        reject('chyba')
      })
    }

    const result = await fixer.getRates(
      api,
      logger,
      ['EUR', 'USD'],
      '2018-12-24'
    )
    expect(calledError).toBe('fixer API call failed')
  })
})
