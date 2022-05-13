const storage = require('./storage.js')
const { logger } = require('../logs.js')

exports.getStock = async (db, ids) => {
  if (!Array.isArray(ids))
    throw new Error(`Wrong ids for single stock api call: ${ids}`)

  let questionMarks = ids.map((it) => '?').join(',')
  let query =
    `select last_value, name, date, price, size from ${storage.STOCKS_DAILY_TABLE} ` +
    `where id in (${questionMarks}) order by date`
  let rows = await storage.call(
    db,
    query,
    ids.map((it) => parseInt(it))
  )

  return rows.map((item) => {
    return { date: item.date, stock_value: item.last_value }
  })
}
