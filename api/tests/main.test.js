const main = require('../src/main.js')
const {mockDegiro} = require('./mockDegiro.js')
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
    await main.importPortfolio(mockDegiro, db)

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
    const expectedDate = (new Date()).toISOString().split('T')[0]
    const expectedHours = (new Date()).getUTCHours()
    const year = (new Date()).getUTCFullYear()
    const month = (new Date()).getUTCMonth() + 1


    const ret = await main.groupPortfolio(db, 'daily')
    expect(ret.length).toEqual(15)
    expect(ret[0].created).toEqual(`${expectedDate}T00:00:00`)

    const hourly = await main.groupPortfolio(db, 'hourly')
    expect(hourly.length).toEqual(15)
    expect(hourly[0].created).toEqual(`${expectedDate}T${expectedHours}:00:00`)

    const monthly = await main.groupPortfolio(db, 'monthly')
    expect(monthly.length).toEqual(15)
    expect(monthly[0].created).toEqual(`${year}-${month}-00T00:00:00`)
  })
})
