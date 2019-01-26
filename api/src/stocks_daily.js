const storage = require('./storage.js')
const {getDateString} = require('./data.js')

exports.fillStocksDaily = async (db, from, to) => {
  let clearSql = `delete from ${storage.STOCKS_DAILY_TABLE} where date >= ?`
  if (to) {
    clearSql += ' and date <= ?'
  }

  await storage.run(db, clearSql, [from, to])

  let sql = `insert into ${storage.STOCKS_DAILY_TABLE} ` +
    'select d.id, d.min_value, d.max_value, sld.value as last_value, d.name, s.currency, ' +
    'd.created as date from stocks_daily as d left join (select id, currency from ' +
    `${storage.STOCKS_TABLE} group by id) as s on d.id=s.id ` +
    'left join stocks_last_daily as sld on d.id=sld.id and d.created=sld.created ' +
    'where d.created >= ? '
  if (to) {
    sql += ' and d.created <= ?'
  }

  await storage.run(db, sql, [from, to])
}

exports.getMissingDates = async db => {
  let sql = `select date from ${storage.STOCKS_DAILY_TABLE} order by date desc limit 1`
  const lastDate = await storage.call(db, sql)

  let fromDate
  if (lastDate && lastDate[0]) {
    fromDate = lastDate[0].date
  } else {
    fromDate = '2000-01-01'
  }

  let d = new Date()
  d.setDate(d.getDate() - 1)

  const toDate = getDateString(d)

  return {fromDate, toDate}
}

exports.updateMissing = async db => {
  const dates = await exports.getMissingDates(db)
  await exports.fillStocksDaily(db, dates.fromDate, dates.toDate)
}
