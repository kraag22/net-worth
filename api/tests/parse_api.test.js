const api = require('../src/parse_api.js')
const rates = require('./rates.json')
const { Fixer } = require('../src/fixer.js')

let fixer = null
let czkRates = null

beforeAll(async () => {
  fixer = new Fixer()
  czkRates = fixer.changeBase(rates.rates, 'CZK')
})

describe('getCurrencies()', () => {
  it('works with empty', () => {
    expect(api.getCurrencies([])).toEqual([])
  })

  it('works', () => {
    const portfolio = [
      { id: 14660208, currency: 'CZK' },
      { id: 331868, currency: 'USD' },
      { id: 331867, currency: 'USD' },
      { id: 331866, currency: 'EUR' },
    ]
    expect(api.getCurrencies(portfolio)).toEqual(['CZK', 'USD', 'EUR'])
  })
})

describe('addCurrencyRateToPortfolio()', () => {
  it('works with empty', () => {
    expect(api.addCurrencyRateToPortfolio([], czkRates)).toEqual([])
  })

  it('uses null for unknown currency or failed rates', () => {
    expect(
      api.addCurrencyRateToPortfolio([{ currency: 'XYZ' }], czkRates)
    ).toEqual([{ currency: 'XYZ', ratio: null }])
    expect(
      api.addCurrencyRateToPortfolio([{ currency: 'USD' }], undefined)
    ).toEqual([{ currency: 'USD', ratio: null }])
  })

  it('works', () => {
    const portfolio = [
      { id: 14660208, currency: 'USD' },
      { id: 331868, currency: 'EUR' },
    ]
    const expected = [
      { id: 14660208, currency: 'USD', ratio: 22.483979209674718 },
      { id: 331868, currency: 'EUR', ratio: 25.790743 },
    ]
    expect(api.addCurrencyRateToPortfolio(portfolio, czkRates)).toEqual(
      expected
    )
  })
})
