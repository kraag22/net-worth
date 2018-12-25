const main = require('../src/main.js')
const {mockDegiro} = require('./mockDegiro.js')
const {MockFixer} = require('./mockFixer.js')
const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')

let db = null
const mockFixer = new MockFixer('x')

beforeAll(async () => {
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe('main function', () => {
  it('importPortfolio() should work', async () => {
    await main.importPortfolio(mockDegiro, db, mockFixer)

    const sql = "select * from stocks"
    const data = await storage.call(db, sql)
    expect(data.length).toBe(15)
    let sum = 0
    data.forEach(item => {
      sum += item.value
    })
    expect(Math.round(sum)).toBe(59156)
  })

  it('fillMissingRates() should work', async () => {
    const sql = "select * from stocks where ratio is null"
    const sqlBase = 'update stocks set ratio = null where currency=?'
    await storage.run(db, sqlBase, ['EUR'])

    const unfilled = await storage.call(db, sql)
    expect(unfilled.length).toBe(1)

    const datesNo = await main.fillMissingRates(db, mockFixer)
    expect(datesNo).toBe(1)

    const data = await storage.call(db, sql)
    expect(data.length).toBe(0)

    const all = await storage.call(db, 'select * from stocks')
    expect(all[0].ratio).toBe(1)
    expect(Math.round(all[1].ratio * 100) / 100).toBe(22.48)
    expect(Math.round(all[12].ratio * 100) / 100).toBe(25.79)
  })

  it('groupPortfolio() should work', async () => {
    const expectedDate = (new Date()).toISOString().split('T')[0]
    let expectedHours = (new Date()).getUTCHours()
    expectedHours = expectedHours < 10 ? `0${expectedHours}` : expectedHours
    const year = (new Date()).getUTCFullYear()
    const month = (new Date()).getUTCMonth() + 1

    const ret = await main.groupPortfolio(db, 'daily')
    expect(ret.length).toEqual(13)
    expect(ret[0].created).toEqual(`${expectedDate}`)

    const hourly = await main.groupPortfolio(db, 'hourly')
    expect(hourly.length).toEqual(13)
    expect(hourly[0].created).toEqual(`${expectedDate}T${expectedHours}:00:00`)

    const monthly = await main.groupPortfolio(db, 'monthly')
    expect(monthly.length).toEqual(13)
    expect(monthly[0].created).toEqual(`${year}-${month}-00`)
  })
})

describe('view function', () => {
  it('getIndexData() should work', async () => {
    const data = await main.getIndexData(db)
    expect(Math.round(data.sum)).toBe(58841)
    expect(data.daily.length).toBe(1)
    expect(data.today.length).toBe(13)
  })

  it('getTodaysData() should work', async () => {
    const sql = `INSERT INTO stocks ` +
      `(id, price, size, value, name, currency, created_at)` +
      `VALUES ('10306755', 400, 1, 4000, 'mb', 'CZK', DATETIME('now', '-1 hour'))`
    await storage.run(db, sql)

    const sql2 = `INSERT INTO stocks ` +
      `(id, price, size, value, name, currency, created_at)` +
      `VALUES ('10306755', 400, 1, 3800, 'mb', 'CZK', DATETIME('now', '-2 hour'))`
    await storage.run(db, sql2)

    const data = await main.getTodaysData(db)
    expect(data[10].name).toBe('mb')
    expect(data[10].values.length).toBe(3)
  })
})
