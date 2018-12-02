const main = require('../src/main.js')
const {mockDeGiro} = require('./mockDeGiro.js')
const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')

let db = null

beforeAll(async () => {
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe('importPortfolio()', () => {
  it('should work', async () => {
    await main.importPortfolio(mockDeGiro, db)

    const sql = "select * from stocks"
    const data = await storage.call(db, sql)
    expect(data.length).toBe(15)
    let sum = 0
    data.forEach(item => {
      sum += item.value
    })
    expect(Math.round(sum)).toBe(59156)

  })
})
