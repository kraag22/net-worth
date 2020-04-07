const storage = require('./storage.js')
const {getDateString} = require('./data.js')

exports.fillStocksDaily = async (db, from, to) => {
  let clearSql = `delete from ${storage.STOCKS_DAILY_TABLE} where date >= ?`
  let params = [from]
  if (to) {
    clearSql += ' and date <= ?'
    params = params.concat([to + ' 23:59:59'])
  }

  await storage.run(db, clearSql, params)

  const viewWhere = 's1.created_at >= ?' + (to ? ' and s1.created_at <= ?' : '')
  let sql = `insert into ${storage.STOCKS_DAILY_TABLE} ` +
    'select d.id, d.min_value, d.max_value, sld.value as last_value, d.name, s.currency, ' +
    'd.created as date from ' +
    '(' + storage.getViewSql('daily', false, true, viewWhere) + ')' +
    ' as d left join (select id, currency from ' +
    `${storage.STOCKS_TABLE} group by id) as s on d.id=s.id ` +
    'left join ' +
    '(' + storage.getViewSql('daily', true, true, viewWhere) + ')' +
    ' as sld on d.id=sld.id and d.created=sld.created ' +
    'where d.created >= ? '
  if (to) {
    sql += ' and d.created <= ?'
  }
  await storage.run(db, sql, params.concat(params, params))
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
