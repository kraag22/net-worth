const columns = ['id', 'price', 'size', 'value', 'name', 'currency']

const flattenItem = value => {
  const ret = []
  columns.forEach(col => ret.push(value[col]))
  return ret
}

const getInsertQuestionmarks = () => {
  const questionmarks = columns.map(col => '?').join(',')
  return `(${questionmarks})`
}

exports.createTable = db => {
  const sql = 'CREATE TABLE stocks (' +
    'id TEXT, ' +
    'price real, ' +
    'size real, ' +
    'value real, ' +
    'name TEXT, ' +
    'currency TEXT ' +
    ')'

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

exports.insert = (db, values) => {
  let sql = 'INSERT INTO stocks (id, price, size, value, name, currency) VALUES'
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
