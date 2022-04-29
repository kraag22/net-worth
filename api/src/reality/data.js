const storage = require('../storage.js')

exports.getRealityData = async (db) => {
  const sql = `select * from ${storage.REALITY_TABLE} order by created_at asc`
  const data = await storage.call(db, sql)
  const parsed = []
  let lastItem = {}
  data.forEach((row) => {
    let date = row['created_at'].split(' ')[0]
    if (lastItem?.date === date) {
      lastItem[row['name']] = row['price']
    } else {
      if (lastItem?.date != null) {
        parsed.push(lastItem)
      }

      lastItem = { date: date }
      lastItem[row['name']] = row['price']
    }
  })
  parsed.push(lastItem)
  return parsed.sort((a, b) => {
    if (new Date(a.date) > new Date(b.date)) {
      return 1
    }
    if (new Date(a.date) < new Date(b.date)) {
      return -1
    }
    return 0
  })
}
