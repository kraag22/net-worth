const sqlite3 = require('sqlite3')
const { logger } = require('../logs.js')
const c = require('./constants')
const columns = ['id', 'price', 'size', 'value', 'name', 'currency', 'ratio']
const STOCKS_TABLE = 'stocks'
const STOCKS_DAILY_TABLE = 'stocks_by_daily'
const EVENTS_TABLE = 'events'
const REALITY_TABLE = 'reality'
const POSITIONS_TABLE = 'positions'
const TRANSACTIONS_TABLE = 'transactions'

exports.STOCKS_TABLE = STOCKS_TABLE
exports.STOCKS_DAILY_TABLE = STOCKS_DAILY_TABLE
exports.EVENTS_TABLE = EVENTS_TABLE
exports.REALITY_TABLE = REALITY_TABLE
exports.POSITIONS_TABLE = POSITIONS_TABLE
exports.TRANSACTIONS_TABLE = TRANSACTIONS_TABLE

const flattenItem = (value) => {
  const ret = []
  columns.forEach((col) => ret.push(value[col]))
  return ret
}

const getInsertQuestionmarks = (columns) => {
  const questionmarks = columns.map((col) => '?').join(',')
  return `(${questionmarks}, DATETIME('now'))`
}

exports.connectDb = (file) => {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database(file, (err) => {
      if (err) {
        reject(err)
        return
      }
      exports
        .createTable(db)
        .then(() => {
          resolve(db)
        })
        .catch((err) => {
          reject(err)
        })
    })
  })
}

exports.createTable = (db) => {
  const stocksTable =
    `CREATE TABLE IF NOT EXISTS ${STOCKS_TABLE} (` +
    'id TEXT, ' +
    'price real, ' +
    'size real, ' +
    'value real, ' +
    'name TEXT, ' +
    'currency TEXT, ' +
    'ratio real,' +
    'created_at TEXT' +
    ')'

  const stocksDailyTable =
    `CREATE TABLE IF NOT EXISTS ${STOCKS_DAILY_TABLE} (` +
    'id TEXT, ' +
    'min_value real, ' +
    'max_value real, ' +
    'last_value real, ' +
    'name TEXT, ' +
    'currency TEXT, ' +
    'date TEXT, ' +
    'currency_balance real, ' +
    'price real, ' +
    'size real, ' +
    'ratio real' +
    ')'

  const eventsTable =
    `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (` +
    'id TEXT, ' +
    'name TEXT, ' +
    'value real, ' +
    'price real, ' +
    'size real, ' +
    'ratio real,' +
    'currency TEXT, ' +
    'date TEXT' +
    ')'

  const realityTable =
    `CREATE TABLE IF NOT EXISTS ${REALITY_TABLE} (` +
    'name TEXT, ' +
    'price real, ' +
    'created_at TEXT, ' +
    'type varchar(20)' +
    ')'

  // what we hold; id is the original DEGIRO product id so history stays linked
  const positionsTable =
    `CREATE TABLE IF NOT EXISTS ${POSITIONS_TABLE} (` +
    'id TEXT PRIMARY KEY, ' +
    'symbol TEXT NOT NULL, ' +
    'name TEXT, ' +
    'currency TEXT NOT NULL, ' +
    'size real NOT NULL, ' +
    'isin TEXT, ' +
    'updated_at TEXT' +
    ')'

  // DEGIRO transactions, from the CSV export (source 'degiro_csv') or derived
  // from size changes in stocks_by_daily (source 'stocks_by_daily')
  const transactionsTable =
    `CREATE TABLE IF NOT EXISTS ${TRANSACTIONS_TABLE} (` +
    'key TEXT PRIMARY KEY, ' +
    'datetime TEXT NOT NULL, ' +
    'product TEXT, ' +
    'isin TEXT, ' +
    'venue TEXT, ' +
    'size real NOT NULL, ' +
    'price real, ' +
    'currency TEXT, ' +
    'value_eur real, ' +
    'fx_rate real, ' +
    'fee_eur real, ' +
    'total_eur real, ' +
    'order_id TEXT, ' +
    'position_id TEXT, ' +
    'applied INTEGER NOT NULL, ' +
    'source TEXT NOT NULL, ' +
    'ingested_at TEXT' +
    ')'

  return Promise.all([
    exports.run(db, stocksTable),
    exports.run(db, positionsTable),
    exports.run(db, transactionsTable),
    exports.run(db, stocksDailyTable),
    exports.run(db, eventsTable),
    exports.run(db, realityTable),
    exports.run(db, exports.getViewSql('hourly', false)),
    exports.run(db, exports.getViewSql('daily', false)),
    exports.run(db, exports.getViewSql('monthly', false)),
    exports.run(db, exports.getViewSql('daily', true)),
    exports.run(db, exports.getViewSql('monthly', true)),
  ])
}

exports.insert = (db, sql, params) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

exports.insertReality = (db, name, type, averagePrice) => {
  const values = [name, averagePrice, type]
  let sql = `INSERT INTO ${REALITY_TABLE} `
  sql += '(name, price, type, created_at) VALUES '
  sql += getInsertQuestionmarks(values)

  return exports.insert(db, sql, values)
}

exports.upsertPosition = (db, position) => {
  const { id, symbol, name, currency, size, isin } = position
  const sql =
    `INSERT INTO ${POSITIONS_TABLE} ` +
    '(id, symbol, name, currency, size, isin, updated_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, DATETIME('now')) " +
    'ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol, ' +
    'name=excluded.name, currency=excluded.currency, size=excluded.size, ' +
    'isin=excluded.isin, updated_at=excluded.updated_at'
  return exports.run(db, sql, [
    String(id),
    symbol,
    name ?? null,
    currency,
    size,
    isin ?? null,
  ])
}

// Latest non-null ratio per currency stored today (UTC, like created_at).
exports.getTodaysRates = async (db) => {
  const sql =
    `select currency, ratio from ${STOCKS_TABLE} where rowid in ` +
    `(select max(rowid) from ${STOCKS_TABLE} where ratio is not null ` +
    "and date(created_at) = date('now') group by currency)"
  const rows = await exports.call(db, sql)
  const rates = {}
  rows.forEach((row) => (rates[row.currency] = row.ratio))
  return rates
}

// Open positions, plus closed ones (size 0) whose sale isn't recorded in
// stocks yet - the size 0 row is what turns into a sell event.
exports.getPositionsToImport = async (db) => {
  const sql =
    `select p.*, (select s.size from ${STOCKS_TABLE} as s where s.id=p.id ` +
    'order by s.created_at desc, s.rowid desc limit 1) as last_size ' +
    `from ${POSITIONS_TABLE} as p order by p.id`
  const rows = await exports.call(db, sql)
  return rows
    .filter(
      (row) => row.size > 0 || row.last_size === null || row.last_size > 0
    )
    .map(({ last_size, ...position }) => position)
}

exports.insertStocks = (db, values) => {
  let sql = `INSERT INTO ${STOCKS_TABLE} `
  sql += '(id, price, size, value, name, currency, ratio, created_at) VALUES '
  sql += values.map((value) => getInsertQuestionmarks(columns)).join(',')

  let params = []
  values.forEach((value) => (params = params.concat(flattenItem(value))))

  return exports.insert(db, sql, params)
}

exports.getViewSql = (groupBy, lastValue, selectOnly, where) => {
  let dateFormat = ''
  switch (groupBy) {
    case 'monthly':
      dateFormat = '%Y-%m-00'
      break
    case 'hourly':
      dateFormat = '%Y-%m-%dT%H:00:00'
      break
    case 'daily':
      dateFormat = '%Y-%m-%d'
      break
    default:
      throw new Error(`getViewSql called with wrong parameter ${groupBy}`)
      break
  }
  const baseValue = 'price * size * ratio'
  const cashFunds = c.CASH_FUNDS.join(',')

  let sql = ''
  if (lastValue) {
    sql += selectOnly
      ? ''
      : `create view if not exists stocks_last_${groupBy} as `
    sql += `select s1.id, s1.price * s1.size * s1.ratio as value, `
    sql += `s1.price, s1.size, s1.ratio, `
    sql += `s1.name, strftime('${dateFormat}', s1.created_at) as created `
    sql += `from stocks as s1 `
    sql += `left join stocks as s2 on s1.id=s2.id and s1.rowid < s2.rowid and `
    sql += `strftime('${dateFormat}', s1.created_at)=strftime('${dateFormat}', s2.created_at) `
    sql += `where s2.rowid is null and s1.id not in (${cashFunds}) `
    sql += where ? `and ${where} ` : ''
  } else {
    sql += selectOnly ? '' : `create view if not exists stocks_${groupBy} as `
    sql += `select id, min(${baseValue}) as min_value, max(${baseValue}) as max_value,`
    sql += `name, strftime('${dateFormat}', created_at) as created `
    sql += `from stocks as s1 where s1.id not in (${cashFunds}) `
    sql += where ? `and ${where} ` : ''
    sql += `group by strftime('${dateFormat}', created_at), id`
  }
  return sql
}

exports.updateCurrencies = async (db, rates, date) => {
  for (const currency of Object.keys(rates)) {
    const ratio = rates[currency]
    const sql =
      `update stocks set ratio=? where currency=? ` +
      `and strftime('%Y-%m-%d', created_at)=? and ratio is null`
    await exports.run(db, sql, [ratio, currency, date])
  }
}

exports.run = (db, sql, fceParams) => {
  const params = fceParams ? fceParams : []
  const profiler = logger.startTimer()
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        profiler.done({ message: 'failed' })
        reject(err)
      } else {
        profiler.done({ message: sql, params: params })
        resolve()
      }
    })
  })
}

exports.call = (db, sql, fceParams) => {
  const params = fceParams ? fceParams : []
  const profiler = logger.startTimer()
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        profiler.done({ message: 'failed' })
        reject(err)
      } else {
        profiler.done({ message: sql, params: params })
        resolve(rows)
      }
    })
  })
}
