const data = require('../src/data.js')
const storage = require('../src/storage.js')
const { Yahoo } = require('../src/yahoo.js')
const { MockFixer } = require('./mockFixer.js')
const { MockPrices } = require('./mockPrices.js')

const mockFixer = new MockFixer('x')
let db = null

const position = (overrides) => ({
  id: '1',
  symbol: 'CEZ.PR',
  name: 'CEZ',
  currency: 'CZK',
  size: 10,
  price: 1000,
  ...overrides,
})

beforeEach(async () => {
  db = await storage.connectDb(':memory:')
})

afterEach((done) => {
  db.close(done)
})

describe('Yahoo', () => {
  it('reads price and currency from the chart endpoint', async () => {
    let calledUrl = null
    const http = {
      get: async (url) => {
        calledUrl = url
        return {
          data: {
            chart: {
              result: [
                { meta: { regularMarketPrice: 765.5, currency: 'EUR' } },
              ],
            },
          },
        }
      },
    }
    const quote = await new Yahoo(http).getPrice('RHM.DE')
    expect(quote).toEqual({ price: 765.5, currency: 'EUR' })
    expect(calledUrl).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/RHM.DE?range=1d&interval=1d'
    )
  })

  it('throws when no price is returned', async () => {
    const http = { get: async () => ({ data: { chart: { result: null } } }) }
    await expect(new Yahoo(http).getPrice('XXX')).rejects.toThrow(
      'No price returned for XXX'
    )
  })
})

describe('positions storage', () => {
  it('upserts a position', async () => {
    await storage.upsertPosition(db, position())
    await storage.upsertPosition(db, position({ size: 15, symbol: 'CEZ.PR' }))
    const rows = await storage.call(db, 'select * from positions')
    expect(rows.length).toBe(1)
    expect(rows[0].size).toBe(15)
    expect(rows[0].updated_at).not.toBeNull()
  })

  it('imports a closed position only until its sale is recorded', async () => {
    await storage.upsertPosition(db, position({ size: 0 }))
    expect((await storage.getPositionsToImport(db)).length).toBe(1)

    await storage.insertStocks(db, [{ ...position(), ratio: 1, value: 10000 }])
    expect((await storage.getPositionsToImport(db)).length).toBe(1)

    await storage.insertStocks(db, [
      { ...position({ size: 0 }), ratio: 1, value: 0 },
    ])
    expect((await storage.getPositionsToImport(db)).length).toBe(0)
  })
})

describe('importPortfolio()', () => {
  it('stores CZK values and skips positions without a usable price', async () => {
    const positions = [
      position(),
      position({
        id: '2',
        symbol: 'AAPL',
        currency: 'USD',
        size: 2,
        price: 200,
      }),
      position({ id: '3', symbol: 'MISSING' }),
      position({ id: '4', symbol: 'RHM.DE', currency: 'EUR' }),
    ]
    for (const p of positions) await storage.upsertPosition(db, p)
    // RHM.DE quoted in USD -> mismatch, MISSING has no quote
    const prices = new MockPrices([
      positions[0],
      positions[1],
      { ...positions[3], currency: 'USD' },
    ])

    await data.importPortfolio(prices, db, mockFixer)

    const rows = await storage.call(db, 'select * from stocks order by id')
    expect(rows.map((r) => r.id)).toEqual(['1', '2'])
    expect(rows[0].value).toBe(10000)
    expect(Math.round(rows[1].value)).toBe(Math.round(400 * rows[1].ratio))
  })

  it('stores null ratio and value when currency rates fail', async () => {
    await storage.upsertPosition(db, position())
    const failingFixer = { getRates: async () => undefined }

    await data.importPortfolio(new MockPrices([position()]), db, failingFixer)

    const rows = await storage.call(db, 'select * from stocks')
    expect(rows[0].ratio).toBeNull()
    expect(rows[0].value).toBeNull()
  })

  it('throws when nothing could be priced', async () => {
    await storage.upsertPosition(db, position())
    await expect(
      data.importPortfolio(new MockPrices([]), db, mockFixer)
    ).rejects.toThrow('No stock prices imported')
  })

  it('throws a clear error when there are no positions', async () => {
    await expect(
      data.importPortfolio(new MockPrices([]), db, mockFixer)
    ).rejects.toThrow('No positions to import')
  })
})

describe('validatePosition()', () => {
  it('accepts a valid position', () => {
    expect(data.validatePosition(position())).toBeNull()
    expect(data.validatePosition(position({ size: 0, id: 4798004 }))).toBeNull()
  })

  it('rejects invalid input', () => {
    expect(data.validatePosition(null)).toBe('body must be an object')
    expect(data.validatePosition(position({ id: ' ' }))).toBe('id is required')
    expect(data.validatePosition(position({ symbol: undefined }))).toBe(
      'symbol is required'
    )
    expect(data.validatePosition(position({ size: '5' }))).toBe(
      'size must be a number'
    )
    expect(data.validatePosition(position({ size: -1 }))).toBe(
      'size must not be negative'
    )
  })
})

describe('currency rates cache', () => {
  const countingFixer = () => {
    const fixer = {
      calls: [],
      getRates: async (api, log, currencies) => {
        fixer.calls.push([...currencies])
        return { CZK: 1, USD: 22, EUR: 25 }
      },
    }
    return fixer
  }
  const usd = position({ id: '2', symbol: 'AAPL', currency: 'USD', price: 200 })
  const eur = position({
    id: '3',
    symbol: 'RHM.DE',
    currency: 'EUR',
    price: 700,
  })

  it('calls fixer only once per day for the same currencies', async () => {
    const fixer = countingFixer()
    await storage.upsertPosition(db, usd)
    const prices = new MockPrices([usd])

    await data.importPortfolio(prices, db, fixer)
    await data.importPortfolio(prices, db, fixer)

    expect(fixer.calls).toEqual([['USD']])
    const rows = await storage.call(db, 'select ratio from stocks')
    expect(rows.map((r) => r.ratio)).toEqual([22, 22])
  })

  it('asks fixer only for currencies missing today', async () => {
    const fixer = countingFixer()
    await storage.upsertPosition(db, usd)
    await data.importPortfolio(new MockPrices([usd]), db, fixer)

    await storage.upsertPosition(db, eur)
    await data.importPortfolio(new MockPrices([usd, eur]), db, fixer)

    expect(fixer.calls).toEqual([['USD'], ['EUR']])
  })

  it('ignores rates from previous days and null ratios', async () => {
    await storage.insertStocks(db, [{ ...usd, ratio: 20, value: 1 }])
    await storage.run(db, "update stocks set created_at='2020-01-01 10:00:00'")
    await storage.insertStocks(db, [{ ...eur, ratio: null, value: null }])

    expect(await storage.getTodaysRates(db)).toEqual({})
  })
})
