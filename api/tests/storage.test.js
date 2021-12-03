const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')
const {MockFixer} = require('./mockFixer.js')

let db = null
let fixer = null

beforeAll(async() => {
  db = await storage.connectDb(':memory:')
  fixer = new MockFixer()
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe('insert()', () => {
  it('works', async () => {
    const expected = {
      id: 'a',
      price: 2,
      size: 3,
      value: 4,
      name: 'x',
      currency: 'USD',
      ratio: 22.2
    }
    const sql = 'select id, price, size, value, name, currency, ratio from stocks'

    await storage.insert(db, [expected, expected])

    const rows = await storage.call(db, sql)
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual(expected)
    expect(rows[1]).toEqual(expected)

    const sqlDates = "select strftime('%Y-%m-%d', created_at) as date from stocks"
    const expectedDate = (new Date()).toISOString().split('T')[0]
    const dates = await storage.call(db, sqlDates)
    expect(dates.length).toBe(2)
    expect(dates[0].date).toEqual(expectedDate)
    expect(dates[1].date).toEqual(expectedDate)
  })
})

describe('insertReality()', () => {
  it('works', async () => {
    const sql = 'select name, price from reality'

    await storage.insertReality(db, "xxx", 15)

    const rows = await storage.call(db, sql)
    expect(rows.length).toBe(1)
    expect(rows[0]).toEqual({
      name: "xxx",
      price: 15
    })
  })
})

describe('updateCurrencies()', () => {
  it('works', async () => {
    const eur = {
      id: 'aa',
      price: 2,
      size: 3,
      value: 4,
      name: 'xd',
      currency: 'EUR'
    }

    const czk = {
      id: 'aab',
      price: 2,
      size: 3,
      value: 4,
      name: 'xd',
      currency: 'CZK'
    }

    const sql = 'select * from stocks where ratio is null'
    const expectedDate = (new Date()).toISOString().split('T')[0]
    const rates = await fixer.getRates()

    await storage.insert(db, [eur, czk])

    const rows = await storage.call(db, sql)
    expect(rows.length).toBe(2)

    await storage.updateCurrencies(db, rates, expectedDate)

    const results = await storage.call(db, sql)
    expect(results.length).toBe(0)

    const all = await storage.call(db, 'select * from stocks')
    expect(all.length).toBe(4)
    expect(all[0].ratio).toBe(22.2)
    expect(all[1].ratio).toBe(22.2)
    expect(all[2].ratio).toBe(25.790743)
    expect(all[3].ratio).toBe(1)

  })
})
