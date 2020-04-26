const storage = require('./storage.js')
const {getDateString, getOrdersData, getOrders} = require('./data.js')
const {logger} = require('../logs.js')

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
    'select d.id, d.min_value, d.max_value, sld.value as last_value, ' +
    'sld.name, s.currency, d.created as date, ' +
    'null as currency_balance, sld.price, sld.size, sld.ratio ' +
    'from (' + storage.getViewSql('daily', false, true, viewWhere) + ')' +
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

exports.fillCurrencyBalance = async (db, orders, from, to) => {
  let czkSql = `update ${storage.STOCKS_DAILY_TABLE} set currency_balance=0 ` +
               `where currency='CZK' and date >= ?`
  let params = [from]
  if (to) {
    czkSql += ' and date <= ?'
    params = params.concat([to + ' 23:59:59'])
  }
  await storage.run(db, czkSql, params)

  let missingSql = `select rowid,* from ${storage.STOCKS_DAILY_TABLE} ` +
                   `where currency!='CZK' and currency_balance is null and date >= ?`
  if (to) {
    missingSql += ' and date <= ?'
  }
  rows = await storage.call(db, missingSql, params)

  const promises = rows.map(async item => {
    if (orders[item.name]) {
      const balance = item.last_value - orders[item.name].avgRatio * item.size * item.price
      const sql = `update ${storage.STOCKS_DAILY_TABLE} ` +
                `set currency_balance = ${balance} ` +
                `where rowid=${item.rowid}`
      return await storage.run(db, sql)
    } else {
      logger.error(`missing ${item.name} in orders`)
    }
  })
  return Promise.all(promises)
}

exports.updateMissing = async db => {
  const dates = await exports.getMissingDates(db)
  await exports.fillStocksDaily(db, dates.fromDate, dates.toDate)
  const ordersData = await getOrdersData(db)
  const {orders} = await getOrders(ordersData)
  await exports.fillCurrencyBalance(db, orders, dates.fromDate, dates.toDate)
}

exports.updateMissingBalance = async (db, to) => {
  const ordersData = await getOrdersData(db)
  const {orders} = await getOrders(ordersData)
  await exports.fillCurrencyBalance(db, orders, '2000-01-01', to)
}
