const sqlite3 = require('sqlite3')
const {logger} = require('../logs.js')
const c = require('./constants')
const columns = ['id', 'price', 'size', 'value', 'name', 'currency', 'ratio']
const STOCKS_TABLE = 'stocks'
const STOCKS_DAILY_TABLE = 'stocks_by_daily'

exports.STOCKS_TABLE = STOCKS_TABLE
exports.STOCKS_DAILY_TABLE = STOCKS_DAILY_TABLE

const flattenItem = value => {
  const ret = []
  columns.forEach(col => ret.push(value[col]))
  return ret
}

const getInsertQuestionmarks = () => {
  const questionmarks = columns.map(col => '?').join(',')
  return `(${questionmarks}, DATETIME('now'))`
}

exports.connectDb = file => {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database(file, (err) => {
      if (err) {
        reject(err.message)
      }
      exports.createTable(db).then(() => {
        resolve(db)
      })
      .catch(err => {
        reject(err)
      })
    })
  })
}

exports.createTable = db => {
  const stocksTable = `CREATE TABLE IF NOT EXISTS ${STOCKS_TABLE} (` +
    'id TEXT, ' +
    'price real, ' +
    'size real, ' +
    'value real, ' +
    'name TEXT, ' +
    'currency TEXT, ' +
    'ratio real,' +
    'created_at TEXT' +
    ')'

  const stocksDailyTable = `CREATE TABLE IF NOT EXISTS ${STOCKS_DAILY_TABLE} (` +
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

  return Promise.all([
    exports.run(db, stocksTable),
    exports.run(db, stocksDailyTable),
    exports.run(db, exports.getViewSql('hourly', false)),
    exports.run(db, exports.getViewSql('daily', false)),
    exports.run(db, exports.getViewSql('monthly', false),
    exports.run(db, exports.getViewSql('daily', true)),
    exports.run(db, exports.getViewSql('monthly', true)))])
}

exports.insert = (db, values) => {
  let sql = `INSERT INTO ${STOCKS_TABLE} `
  sql += '(id, price, size, value, name, currency, ratio, created_at) VALUES '
  sql += values.map(value => getInsertQuestionmarks()).join(',')

  let params = []
  values.forEach(value => params = params.concat(flattenItem(value)))

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

exports.getViewSql = (groupBy, lastValue, selectOnly, where) => {
  let dateFormat = ''
  switch(groupBy) {
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
    sql += selectOnly ? '' : `create view if not exists stocks_last_${groupBy} as `
    sql += `select s1.id, s1.price * s1.size * s1.ratio as value, `
    sql += `s1.price, s1.size, s1.ratio, `
    sql += `s1.name, strftime('${dateFormat}', s1.created_at) as created `
    sql += `from stocks as s1 `
    sql += `left join stocks as s2 on s1.id=s2.id and s1.rowid < s2.rowid and `
    sql += `strftime('${dateFormat}', s1.created_at)=strftime('${dateFormat}', s2.created_at) `
    sql += `where s2.rowid is null and s1.id not in (${cashFunds}) `
    sql += where ? `and ${where} ` : ''
  } else {
    sql +=  selectOnly ? '' :`create view if not exists stocks_${groupBy} as `
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
    const sql = `update stocks set ratio=? where currency=? ` +
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
        profiler.done({ message: 'failed'})
        reject(err)
      } else {
        profiler.done({ message: sql, params: params})
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
        profiler.done({ message: 'failed'})
        reject(err)
      } else {
        profiler.done({ message: sql, params: params})
        resolve(rows)
      }
    })
  })
}
