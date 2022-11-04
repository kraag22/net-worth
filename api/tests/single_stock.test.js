const storage = require('../src/storage.js')
const {
  getStock,
  getOrdersDataForStock: getOrdersForStock,
  Stock,
} = require('../src/single_stock.js')
const { computeAndStoreOrdersData } = require('../src/data')
const { getOrders } = require('../src/order.js')
const sqlite3 = require('sqlite3')
const {
  insertATaTDaily,
  insertMonetaDaily,
  insertMonetaOrders,
  insertSP500Daily,
  insertSP500Orders,
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

    let stock = new Stock(db, 332126)
    let balance = await stock.getBalance()

    expect(Object.keys(stock.orders).length).toBe(3)

    expect(stock.timeline.length).toBe(balance.length)
    expect(balance[0].stock_value).toBeCloseTo(-32.9, 0)
    expect(balance[balance.length - 1].stock_value).toBeCloseTo(-326.3, 0)
  })

  it('getPurchasePrice() should work', () => {
    let stock = new Stock(db, 0)
    let orders = { '2019-12-14': 20, '2019-12-12': 10 }

    expect(stock.getPurchasePrice('2019-12-11', orders)).toBe(10)
    expect(stock.getPurchasePrice('2019-12-12', orders)).toBe(10)
    expect(stock.getPurchasePrice('2019-12-13', orders)).toBe(10)
    expect(stock.getPurchasePrice('2019-12-14', orders)).toBe(20)
    expect(stock.getPurchasePrice('2019-12-15', orders)).toBe(20)
  })
})

// Compare Stock output with manually computed correct values
describe('SP500 stock', () => {
  it('contains correct orders and balance', async () => {
    await insertSP500Daily(db)
    await insertSP500Orders(db)

    let stock = new Stock(db, 4622757)
    await stock.fetchData()

    expect(stock.orders['2019-08-27']).toBe(6674)
    expect(stock.orders['2019-11-18']).toBe(13905)
    expect(stock.orders['2020-03-02']).toBe(27440)

    expect(stock.timeline[23].date).toBe('2019-12-24')
    expect(stock.timeline[23].stock_value).toBeCloseTo(14855.7, 0)

    expect(stock.timeline[24].date).toBe('2019-12-25')
    expect(stock.timeline[24].stock_value).toBeCloseTo(15061.2, 0)

    let balance = await stock.getBalance()
    expect(balance[23].date).toBe('2019-12-24')
    expect(balance[23].stock_value).toBeCloseTo(950.5, 0)

    expect(balance[24].date).toBe('2019-12-25')
    expect(balance[24].stock_value).toBeCloseTo(1155.8, 0)
  })
})
