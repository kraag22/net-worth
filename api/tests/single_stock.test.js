const storage = require('../src/storage.js')
const { getStock, getOrdersForStock, Stock } = require('../src/single_stock.js')
const { computeAndStoreOrdersData } = require('../src/data')
const sqlite3 = require('sqlite3')
const {
  insertATaTDaily,
  insertMonetaDaily,
  insertMonetaOrders,
} = require('./orders2.js')
const { insertStocks, insertATnTOrders } = require('./orders.js')

let db = null

beforeEach(async () => {
  db = await storage.connectDb(':memory:')
})

afterEach((done) => {
  db.close((err) => {
    expect(err).toBeNull()
    done()
  })
})

describe('it', () => {
  it('should be able to get the data for stock', async () => {
    await insertATaTDaily(db)

    let data = await getStock(db, '332126')

    expect(data.length).toBe(41)
  })
})

describe('getOrdersForStock', () => {
  it('should be able to get the data', async () => {
    await insertStocks(db)
    await computeAndStoreOrdersData(db)
    let data = await getOrdersForStock(db, '1533610')

    expect(data.length).toBe(2)
  })
})

describe('Stock class', () => {
  it('method getBalance should return correct timeline data', async () => {
    await insertATaTDaily(db)
    await insertATnTOrders(db)
    await computeAndStoreOrdersData(db)

    let stock = new Stock(db, 332126)
    let balance = await stock.getBalance()

    expect(Object.keys(stock.orders).length).toBe(2)

    expect(stock.timeline.length).toBe(balance.length)
    expect(balance[0].stock_value).toBeCloseTo(1954.026, 2)
    expect(balance[balance.length - 1].stock_value).toBeCloseTo(-1475.393, 2)
  })

  it('getBalance works when first order is older than first timeline entry', async () => {
    await insertMonetaDaily(db)
    await insertMonetaOrders(db)

    let stock = new Stock(db, 10306755)
    let balance = await stock.getBalance()

    expect(Object.keys(stock.orders).length).toBe(1)

    expect(stock.timeline.length).toBe(balance.length)
    expect(balance[0].stock_value).toBeCloseTo(155.026, 2)
    expect(balance[balance.length - 1].stock_value).toBeCloseTo(141.71, 2)
  })
})
