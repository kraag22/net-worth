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

describe('main function', () => {
  it('importPortfolio() should work', async () => {
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

  it('groupPortfolio() should work', async () => {
    const ret = await main.groupPortfolio(db, 'daily')
    expect(ret.length).toEqual(15)
    expect(ret[0].created).toEqual('2018-12-03T00:00:00')

    const hourly = await main.groupPortfolio(db, 'hourly')
    expect(hourly.length).toEqual(15)
    expect(hourly[0].created).toEqual('2018-12-03T07:00:00')

    const monthly = await main.groupPortfolio(db, 'monthly')
    expect(monthly.length).toEqual(15)
    expect(monthly[0].created).toEqual('2018-12-00T00:00:00')
  })
})
