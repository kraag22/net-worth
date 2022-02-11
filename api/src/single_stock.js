const storage = require('./storage.js')
const {logger} = require('../logs.js')

exports.getStock = async (db, id) => {
  let query =`select last_value, name, date, price, size from ${storage.STOCKS_DAILY_TABLE} ` +
    `where id=? order by date`

  return await storage.call(db, query, [id])
}
