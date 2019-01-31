const data = require('../src/data.js')
const {mockDegiro} = require('./mockDegiro.js')
const {MockFixer} = require('./mockFixer.js')
const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')
const sd = require('../src/stocks_daily.js')
const i = require('./orders.js')

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

describe('data function', () => {
  it('importPortfolio() should work', async () => {
    await data.importPortfolio(mockDegiro, db, mockFixer)

    const sql = "select * from stocks"
    const portfolio = await storage.call(db, sql)
    expect(portfolio.length).toBe(15)
    let sum = 0
    portfolio.forEach(item => {
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

    const datesNo = await data.fillMissingRates(db, mockFixer)
    expect(datesNo).toBe(1)

    const stocks = await storage.call(db, sql)
    expect(stocks.length).toBe(0)

    const all = await storage.call(db, 'select * from stocks')
    expect(all[0].ratio).toBe(1)
    expect(Math.round(all[1].ratio * 100) / 100).toBe(22.48)
    expect(Math.round(all[12].ratio * 100) / 100).toBe(25.79)
  })

  it('groupPortfolio() should work', async () => {
    const expectedDate = (new Date()).toISOString().split('T')[0]
    let expectedHours = (new Date()).getUTCHours()
    expectedHours = String(expectedHours).padStart(2, '0')
    const year = (new Date()).getUTCFullYear()
    let month = (new Date()).getUTCMonth() + 1
    month = String(month).padStart(2, '0')

    const ret = await data.groupPortfolio(db, 'daily')
    expect(ret.length).toEqual(13)
    expect(ret[0].created).toEqual(`${expectedDate}`)

    const hourly = await data.groupPortfolio(db, 'hourly')
    expect(hourly.length).toEqual(13)
    expect(hourly[0].created).toEqual(`${expectedDate}T${expectedHours}:00:00`)

    const monthly = await data.groupPortfolio(db, 'monthly')
    expect(monthly.length).toEqual(13)
    expect(monthly[0].created).toEqual(`${year}-${month}-00`)
  })
})

describe('data function', () => {
  it('getAllData() should work', async () => {
    await sd.fillStocksDaily(db, '2000-01-01')

    const indexData = await data.getAllData(db)
    expect(indexData.daily.length).toBe(1)
    expect(indexData.today.length).toBe(13)
    expect(indexData.todaySum.length).toBe(1)
  })

  it('getTodaysData() should work', async () => {
    const sql = `INSERT INTO stocks ` +
      `(id, price, size, value, name, currency, ratio, created_at)` +
      `VALUES ('10306755', 400, 1, 4000, 'mb', 'CZK', 1, DATETIME('now', '-1 hour'))`
    await storage.run(db, sql)

    const sql2 = `INSERT INTO stocks ` +
      `(id, price, size, value, name, currency, ratio, created_at)` +
      `VALUES ('10306755', 400, 1, 3800, 'mb', 'CZK', 1, DATETIME('now', '-2 hour'))`
    await storage.run(db, sql2)

    const todaysData = await data.getTodaysData(db)
    expect(todaysData[10].name).toBe('mb')
    expect(todaysData[10].values.length).toBe(3)
  })

  it('sumTodaysData() should work', async () => {
    const todaysData = await data.getTodaysData(db)
    let result = data.sumTodaysData(todaysData)
    expect(result).toEqual([53983])
  })

  it('getOrdersData(), getOrdersTimeline() and getTotalOrder() should work', async () => {
    const promises = i.inserts.map(insert => {
      return storage.run(db, insert)
    })
    await Promise.all(promises)

    const ordersData = await data.getOrdersData(db)
    expect(ordersData.length).toEqual(18)
    expect(ordersData[8].value).toEqual(6398)

    const result = data.getOrdersTimeline(ordersData)
    expect(data.getTotalOrder(result)).toEqual(65403)
  })
})

describe('graphData function', () => {
  it('parseDate() should work', async () => {
    const ret = data.parseDate('2000-02-11')
    expect(ret.getFullYear()).toBe(2000)
    expect(ret.getMonth()).toBe(1)
  })

  it('getGraphData() should work', async () => {
    const graphData = await data.getGraphData(db)
    const xyChart = JSON.parse(graphData.xyChart)

    expect(xyChart.length).toBe(1)
    expect(xyChart[0].invested).toBe(65403)
    expect(xyChart[0].current).toBe(58841)
  })

})
