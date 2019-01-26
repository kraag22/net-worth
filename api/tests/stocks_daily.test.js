const sd = require('../src/stocks_daily.js')
const data = require('../src/data.js')
const {mockDegiro} = require('./mockDegiro.js')
const {MockFixer} = require('./mockFixer.js')
const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')

let db = null
const mockFixer = new MockFixer('x')

beforeAll(async () => {
  db = await storage.connectDb(':memory:')

  await data.importPortfolio(mockDegiro, db, mockFixer)
  await storage.call(db, 'update stocks set created_at="2018-12-24"')
  await data.importPortfolio(mockDegiro, db, mockFixer)
  await storage.call(db, 'update stocks set created_at="2018-12-25" where created_at > "2018-12-24"')
  await data.importPortfolio(mockDegiro, db, mockFixer)
  await storage.call(db, 'update stocks set created_at="2018-12-26" where created_at > "2018-12-25"')
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe('stocks daily', () => {
  it('fillStocksDaily() should work', async () => {
    await sd.fillStocksDaily(db, '2018-12-25', '2018-12-26')

    const sql = `select count(*) as no from ${storage.STOCKS_DAILY_TABLE}`
    const result = await storage.call(db, sql)

    expect(result[0].no).toBe(26)

    await sd.fillStocksDaily(db, '2018-12-23')
    const result2 = await storage.call(db, sql)

    expect(result2[0].no).toBe(39)
  })

  it('getMissingDates() should work', async () => {
    const result = await sd.getMissingDates(db)

    expect(result.fromDate).toBe('2018-12-26')
    expect(result.toDate.length).toBe(10)
  })

  it('updateMissing() should work', async () => {
    const sql = `select count(*) as no from ${storage.STOCKS_DAILY_TABLE}`

    await sd.updateMissing(db)

    const res = await storage.call(db, sql)
    expect(res[0].no).toBe(39)
  })
})

