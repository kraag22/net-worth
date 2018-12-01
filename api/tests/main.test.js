const main = require('../src/main.js')
const {mockDeGiro} = require('./mockDeGiro.js')
const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')

let db = null

beforeAll((done) => {
  db = new sqlite3.Database(':memory:', (err) => {
    expect(err).toBeNull()

    storage.createTable(db).then(() => {
      done()
    })
    .catch(err => {
      expect(err).not.toBeDefined()
      done()
    })
  })
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe('get data and store it to db', () => {
  it('should work', async () => {
    const portfolio = await main.getPortfolio(mockDeGiro)
    expect(portfolio.length).toEqual(15)

    await storage.insert(db, portfolio)

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
