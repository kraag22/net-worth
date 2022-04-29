const api = require('../src/parse_api.js')
const data = require('./portfolio.json')
const products = require('./products.json')
const rates = require('./rates.json')
const { Fixer } = require('../src/fixer.js')

let fixer = null
let czkRates = null

beforeAll(async () => {
  fixer = new Fixer()
  czkRates = fixer.changeBase(rates.rates, 'CZK')
})

describe('getPortfolio()', () => {
  it('works with empty', () => {
    expect(api.getPortfolio({})).toEqual([])
  })

  it('works', () => {
    expect(api.getPortfolio(data).length).toEqual(15)
  })

  it('can sum all', () => {
    const items = api.getPortfolio(data)
    let sum = 0
    items.forEach((i) => {
      // console.log(i.id, i.size, i.price, i.size * i.price, i.value)
      sum += i.value
    })
    expect(Math.round(sum)).toEqual(59156)
  })
})

describe('getItem()', () => {
  it('works with empty', () => {
    expect(api.getItem({})).toEqual({})
  })

  it('works', () => {
    const expected = {
      id: '5212042',
      price: 59,
      size: 53,
      value: 3127,
    }
    expect(api.getItem(data.portfolio[0])).toEqual(expected)
  })
})

describe('getIds()', () => {
  it('works with empty', () => {
    expect(api.getIds([])).toEqual([])
  })

  it('works', () => {
    expect(api.getIds([{ id: 1 }, { id: 2 }])).toEqual([1, 2])
  })
})

describe('addMetaToPortfolio()', () => {
  it('works with empty', () => {
    expect(api.addMetaToPortfolio([], products)).toEqual([])
  })

  it('works', () => {
    const portfolio = [{ id: 14660208 }, { id: 331868 }]
    const expected = [
      { id: 14660208, currency: 'CZK', name: 'AVAST PLC' },
      { id: 331868, currency: 'USD', name: 'Apple Inc' },
    ]
    expect(api.addMetaToPortfolio(portfolio, products)).toEqual(expected)
  })
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
