const storage = require('../src/storage.js')
const { getStock } = require('../src/single_stock.js')
const sqlite3 = require('sqlite3')
const { insertATaT } = require('./atat_daily.js')

let db = null

beforeAll(async () => {
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close((err) => {
    expect(err).toBeNull()
    done()
  })
})

describe('it', () => {
  it('should', async () => {
    await insertATaT(db)

    let data = await getStock(db, '332126')

    expect(data.length).toBe(41)
  })
})
