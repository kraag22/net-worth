const sqlite3 = require('sqlite3')

const columns = ['id', 'price', 'size', 'value', 'name', 'currency', 'ratio']
const STOCKS_TABLE = 'stocks'

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
  const sql = `CREATE TABLE IF NOT EXISTS ${STOCKS_TABLE} (` +
    'id TEXT, ' +
    'price real, ' +
    'size real, ' +
    'value real, ' +
    'name TEXT, ' +
    'currency TEXT, ' +
    'ratio real,' +
    'created_at TEXT' +
    ')'

  return Promise.all([
    exports.run(db, sql),
    exports.run(db, exports.getViewSql('hourly')),
    exports.run(db, exports.getViewSql('daily')),
    exports.run(db, exports.getViewSql('monthly'))])
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

exports.getViewSql = groupBy => {
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

  let lastSql = `(select value from stocks as s2 where `
  lastSql += `strftime('${dateFormat}', s2.created_at)=strftime('${dateFormat}', s1.created_at) `
  lastSql += `and s2.id=s1.id order by s2.created_at desc limit 1)`

  let sql = `create view if not exists stocks_${groupBy} as `
  sql += `select id, min(value) as min_value, max(value) as max_value,`
  sql += `name, strftime('${dateFormat}', created_at) as created, `
  sql += `${lastSql} as last_value `
  sql += `from stocks as s1 group by strftime('${dateFormat}', created_at), id`
  return sql
}

exports.run = (db, sql) => {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

exports.call = (db, sql) => {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err)
      } else {
        resolve(rows)
      }
    })
  })
}
