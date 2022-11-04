const storage = require('./storage.js')
const { logger } = require('../logs.js')
const { getOrders } = require('./order.js')

exports.getStock = async (db, id) => {
  let query =
    `select last_value, name, date, price, size from ${storage.STOCKS_DAILY_TABLE} ` +
    `where id=? order by date`
  let rows = await storage.call(db, query, parseInt(id))
  return rows.map((item) => {
    return { date: item.date, stock_value: item.last_value }
  })
}

exports.getOrdersDataForStock = async (db, id) => {
  const sql = `select * from ${storage.EVENTS_TABLE} where id=? order by date`
  return storage.call(db, sql, id)
}

class Stock {
  constructor(_db, _id) {
    this.id = _id
    this.db = _db
    this.orders = {}
    this.timeline = []
  }

  // for given date returns purchase price. (e.g. how much money you spend to buy stock at given time)
  getPurchasePrice(date, orders) {
    if (orders[date]) {
      return orders[date]
    }

    let currentDate = new Date(date)
    let purchaseDates = Object.keys(orders)
      .map((item) => new Date(item))
      .sort(function (a, b) {
        return b - a
      })
      .reverse()
      // from format "2022-08-12T12:19:06.122Z" -> "2022-08-12"
      .map((item) => item.toISOString().split('T')[0])

    // if we have timeline date before we bought the stock, we miss some date, use oldest order
    let oldestPurchaseDate = new Date(purchaseDates[0])
    if (currentDate < oldestPurchaseDate) {
      return orders[purchaseDates[0]]
    }

    let purchasePrice = 0
    // when we are missing timeline data (order was placed before we started collecting timeline)
    purchaseDates.forEach((orderCreatedAt) => {
      if (new Date(orderCreatedAt) < currentDate) {
        purchasePrice = orders[orderCreatedAt]
      }
    })
    return purchasePrice
  }

  async fetchData() {
    let ordersData = await exports.getOrdersDataForStock(this.db, this.id)
    let stockOrdersTimeline = Object.entries(getOrders(ordersData)?.timeline)

    stockOrdersTimeline.forEach((item) => {
      this.orders[item[0]] = item[1]
    })
    // console.log(this.orders)
    this.timeline = await exports.getStock(this.db, [this.id])
    // console.log(this.timeline)
  }

  // returns timeline of one stock with balance for it (actual value - purchase value)
  async getBalance() {
    await this.fetchData()
    let balanceTimeline = []

    this.timeline.forEach((dayValue) => {
      let date = dayValue['date']
      let stock_value = dayValue['stock_value']

      let purchasePrice = this.getPurchasePrice(date, this.orders)

      balanceTimeline.push({
        date: date,
        stock_value: stock_value - purchasePrice,
      })
    })

    return balanceTimeline
  }
}

exports.Stock = Stock
