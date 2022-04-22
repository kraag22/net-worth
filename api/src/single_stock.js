const storage = require('./storage.js')
const {logger} = require('../logs.js')

exports.getStock = async (db, id) => {
  let query =`select last_value, name, date, price, size from ${storage.STOCKS_DAILY_TABLE} ` +
    `where id=? order by date`
  let rows = await storage.call(db, query, [id])

  return rows.map(item => {
    return { date: item.date, stock_value: item.last_value }
  })
}
