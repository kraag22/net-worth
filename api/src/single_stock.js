const storage = require('./storage.js')
const { logger } = require('../logs.js')

exports.getStock = async (db, id) => {
  let query =
    `select last_value, name, date, price, size from ${storage.STOCKS_DAILY_TABLE} ` +
    `where id=? order by date`
  let rows = await storage.call(db, query, parseInt(id))
  return rows.map((item) => {
    return { date: item.date, stock_value: item.last_value }
  })
}

exports.getOrdersForStock = async (db, id) => {
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

  async fetchData() {
    let ordersData = await exports.getOrdersForStock(this.db, this.id)

    ordersData.forEach((item) => {
      this.orders[item.date] = item.value
    })
    // console.log(this.orders)
    this.timeline = await exports.getStock(this.db, [this.id])
    // console.log(this.timeline)
  }

  // returns timeline of one stock with balance for it (actual value - purchase value)
  async getBalance() {
    await this.fetchData()
    let balanceTimeline = []
    let base = 0
    this.timeline.forEach((dayValue) => {
      let date = dayValue['date']
      let stock_value = dayValue['stock_value']

      if (balanceTimeline.length == 0 && !this.orders[date]) {
        // if we have timeline date before we bought the stock, we miss some date, use last order
        let lastDate = Object.keys(this.orders)
          .map((item) => new Date(item))
          .sort(function (a, b) {
            a - b
          })
          .pop()

        // from format "2022-08-12T12:19:06.122Z" -> "2022-08-12"
        lastDate = lastDate.toISOString().split('T')[0]
        base = this.orders[lastDate]
      }

      if (this.orders[date]) {
        base = this.orders[date]
      }

      balanceTimeline.push({ date: date, stock_value: stock_value - base })
    })

    return balanceTimeline
  }
}

exports.Stock = Stock
