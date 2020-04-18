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
  await storage.call(db, `update stocks set ratio=23 where currency='USD' and created_at > "2018-12-24"`)
  await storage.call(db, `update stocks set ratio=24 where currency='USD' and created_at > "2018-12-25"`)
  await storage.call(db, `update stocks set ratio=21 where currency='EUR' and created_at > "2018-12-24"`)
  await storage.call(db, `update stocks set ratio=20 where currency='EUR' and created_at > "2018-12-25"`)
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

  it('fillCurrencyBalance() should work', async() => {
    const sql = `select count(*) as no from ${storage.STOCKS_DAILY_TABLE} ` +
                `where currency_balance is not null`
    const result = await storage.call(db, sql)
    expect(result[0].no).toBe(0)

    const ordersData = await data.getOrdersData(db)
    const {orders} = await data.getOrders(ordersData)
    await sd.fillCurrencyBalance(db, orders, '2018-12-24', '2018-12-26')

    const sql2 = `select sum(currency_balance) as no from ${storage.STOCKS_DAILY_TABLE} ` +
                `where currency='CZK'`
    const result2 = await storage.call(db, sql2)
    expect(result2[0].no).toBe(0)

    const sql3 = `select rowid, * from ${storage.STOCKS_DAILY_TABLE} where id='331868'`
    const result3 = await storage.call(db, sql3)
    expect(Math.round(result3[0].currency_balance)).toBe(0)
    expect(Math.round(result3[1].currency_balance)).toBe(107)
    expect(Math.round(result3[2].currency_balance)).toBe(315)

    const sql4 = `select rowid, * from ${storage.STOCKS_DAILY_TABLE} where id='890163'`
    const result4 = await storage.call(db, sql4)
    expect(Math.round(result4[0].currency_balance)).toBe(0)
    expect(Math.round(result4[1].currency_balance)).toBe(-733)
    expect(Math.round(result4[2].currency_balance)).toBe(-886)
  })

  it('updateMissing() should work', async () => {
    const sql = `select count(*) as no, sum(currency_balance) as cb ` +
                `from ${storage.STOCKS_DAILY_TABLE}`

    await sd.updateMissing(db)

    const res = await storage.call(db, sql)
    expect(res[0].no).toBe(39)
    expect(Math.round(res[0].cb)).toBe(192)
  })
})

