const data = require('../src/data.js')
const order = require('../src/order.js')
const { mockDegiro } = require('./mockDegiro.js')
const { MockFixer } = require('./mockFixer.js')
const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')
const sd = require('../src/stocks_daily.js')
const { insertStocks } = require('./orders.js')

let db = null
const mockFixer = new MockFixer('x')

beforeAll(async () => {
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close((err) => {
    expect(err).toBeNull()
    done()
  })
})

describe('data function', () => {
  it('importPortfolio() should work', async () => {
    await data.importPortfolio(mockDegiro, db, mockFixer)

    const sql = 'select * from stocks'
    const portfolio = await storage.call(db, sql)
    expect(portfolio.length).toBe(15)
    let sum = 0
    portfolio.forEach((item) => {
      sum += item.value
    })
    expect(Math.round(sum)).toBe(59156)
  })

  it('getAvgCurrencyRatio() should work for buying', () => {
    const lastOrder = { size: 10, avgRatio: 26 }

    const ret = order.getAvgCurrencyRatio(lastOrder, 20, 25)
    expect(ret).toBe(25.5)
  })

  it('getAvgCurrencyRatio() should work for selling', () => {
    const lastOrder = { size: 20, avgRatio: 30 }

    const ret = order.getAvgCurrencyRatio(lastOrder, 10, 20)
    expect(ret).toBe(30)
  })

  it('fillMissingRates() should work', async () => {
    const sql = 'select * from stocks where ratio is null'
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
    const expectedDate = new Date().toISOString().split('T')[0]
    let expectedHours = new Date().getUTCHours()
    expectedHours = String(expectedHours).padStart(2, '0')
    const year = new Date().getUTCFullYear()
    let month = new Date().getUTCMonth() + 1
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
    expect(
      indexData.daily[0].usd_value +
        indexData.daily[0].other_value +
        indexData.daily[0].eur_value
    ).toBe(indexData.daily[0].value)
    expect(indexData.today.length).toBe(13)
    expect(indexData.todaySum.balance).toBe('0')
  })

  it('getTodaysData() should work', async () => {
    const sql =
      `INSERT INTO stocks ` +
      `(id, price, size, value, name, currency, ratio, created_at)` +
      `VALUES ('11', 300, 2, 600, 'made up', 'CZK', 1, DATETIME('now', '-1 hour'))`
    await storage.run(db, sql)

    const sql2 =
      `INSERT INTO stocks ` +
      `(id, price, size, value, name, currency, ratio, created_at)` +
      `VALUES ('11', 400, 2, 800, 'made up', 'CZK', 1, DATETIME('now', '-2 hour'))`
    await storage.run(db, sql2)

    const todaysData = await data.getTodaysData(db)
    const res = todaysData.find((i) => i.id === '11')
    expect(res.name).toBe('made up')
    expect(res.values.length).toBe(2)
  })

  it('sumTodaysData() should work', async () => {
    const todaysData = await data.getTodaysData(db)
    let result = data.sumTodaysData(todaysData)
    expect(result.lastSum).toEqual(59443)
    expect(result.balance).toEqual('-200')
  })

  it('computeAndStoreOrdersData() should work', async () => {
    await insertStocks(db)
    let ordersData = await order.getOrdersData(db)
    expect(ordersData.length).toEqual(13)

    await data.computeAndStoreOrdersData(db)
    await data.computeAndStoreOrdersData(db)

    ordersData = await order.getOrdersData(db)
    expect(ordersData.length).toEqual(18)
  })

  it('getOrdersData(), getOrders() and getTotalOrder() should work', async () => {
    const ordersData = await order.getOrdersData(db)
    expect(ordersData.length).toEqual(18)
    expect(ordersData[8].value).toEqual(6398)

    const { timeline, orders } = order.getOrders(ordersData)
    expect(order.getTotalOrder(timeline)).toEqual(65803)
    expect(orders['10306755'].size).toEqual(67)
    expect(orders['10306755'].price).toEqual(5153.25)
    expect(orders['331868'].avgRatio).toEqual(22.59299731525348)
    expect(orders['890163'].avgRatio).toEqual(25.412921666666662)
  })

  it('getStocksBalance() should work', async () => {
    const ordersData = await order.getOrdersData(db)
    const { orders } = order.getOrders(ordersData)

    const result = await data.getStocksBalance(db, orders)
    expect(result.length).toBe(13)
    expect(result[0].currency).toBe('USD')
    expect(result[0].name).toBe('Microsoft')
    expect(result[0].price).toBe(4774)
    let sum = 0
    result.forEach((item) => (sum += item.price + item.balance))
    expect(sum).toBe(57676)
  })

  it('sumStocksBalanceByCurrency() should work', async () => {
    const ordersData = await order.getOrdersData(db)
    const { orders } = order.getOrders(ordersData)
    const stocksBalance = await data.getStocksBalance(db, orders)

    const result = data.sumStocksBalanceByCurrency(stocksBalance)
    expect(result.length).toBe(3)
    expect(result[1].price).toBe(34863)
    expect(result[1].currency).toBe('CZK')
    expect(result[1].balance).toBe(-350)
    expect(result[1].percents).toBe(-1.003929667555866)
  })

  it('getStocksBalance() should work with name change', async () => {
    const ordersData = await order.getOrdersData(db)
    const { orders } = order.getOrders(ordersData)

    const result = await data.getStocksBalance(db, orders)
    expect(result.length).toBe(13)
    const nokia = result.find((i) => i.id === '890163')
    expect(nokia.name).toBe('NOKIA OYJ')
    expect(nokia.balance).toBe(593)
  })

  it('getImportStatus() should work', async () => {
    const ret = await data.getImportStatus(db, new Date())

    expect(ret.import_status).toBe('OK')

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 10)
    const retFail = await data.getImportStatus(db, futureDate)

    expect(retFail.import_status).toBe('FAILED')
  })

  it('getImportStatus() should work after midnight', async () => {
    const afterMidnight = new Date()
    afterMidnight.setDate(afterMidnight.getDate() + 10)
    afterMidnight.setHours(0)
    afterMidnight.setMinutes(10)
    const ret = await data.getImportStatus(db, afterMidnight)

    expect(ret.import_status).toBe('OK')

    afterMidnight.setHours(1)
    const retFail = await data.getImportStatus(db, afterMidnight)
    expect(retFail.import_status).toBe('FAILED')
  })

  it('getStockIds() should work', async () => {
    const stocks = await data.getStockIds(db)

    expect(stocks.length).toBe(15)
    expect(stocks[0].id).toBe('14660208')
    expect(stocks[0].name).toBe('AVAST PLC')
    expect(stocks[0].currency).toBe('CZK')
  })
})

describe('getData() function', () => {
  it('should work for reality', async () => {
    await storage.insertReality(db, 'jezdovice3kk', 23_445)
    const graphData = await data.getData(db, 'reality')

    expect(graphData.length).toBe(1)
    expect(graphData[0].jezdovice3kk).toBe(23445)
  })

  it('should work for single stock', async () => {
    const graphData = await data.getData(db, 'single_stock', {
      ids: '10306755',
    })

    expect(graphData.length).toBe(1)
    expect(graphData[0].stock_value).toBeCloseTo(106.5)
  })

  it('should work for stocks performance', async () => {
    const graphData = await data.getData(db, 'balance_by_stocks')

    expect(graphData.length).toBe(13)
    expect(graphData[0].id).toBe('332111')
    expect(graphData[0].balance).toBe(1016)
  })

  it('getBulkData() should work', async () => {
    const graphData = await data.getData(db, 'bulk')

    expect(graphData.sumByCurrencyData.length).toBe(1)
    expect(graphData.sumByCurrencyData[0].invested).toBe(65803)
    expect(graphData.sumByCurrencyData[0].current).toBe(58841)
  })

  it('throws for wrong action', async () => {
    await expect(data.getData(db, 'XXX')).rejects.toThrow(
      'Unknow action to process: XXX'
    )
  })
})

describe('graphData function', () => {
  it('parseDate() should work', async () => {
    const ret = data.parseDate('2000-02-11')
    expect(ret.getFullYear()).toBe(2000)
    expect(ret.getMonth()).toBe(1)
  })

  it('parseTodayData() should work', async () => {
    const todaysData = await data.getTodaysData(db)
    const result = data.parseTodayData(todaysData)
    const madeUp = result.find((i) => i.name === 'made up')

    expect(result.length).toBe(14)
    expect(madeUp.name).toBe('made up')
    expect(madeUp.balance).toBe(-200)
  })
})
