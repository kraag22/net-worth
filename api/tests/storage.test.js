const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')

let db = null;

beforeAll(async() => {
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe('insert()', () => {
  it('works', async () => {
    const expected = {
      id: 'a',
      price: 2,
      size: 3,
      value: 4,
      name: 'x',
      currency: '$'
    }
    const sql = 'select id, price, size, value, name, currency from stocks'

    await storage.insert(db, [expected, expected])

    const rows = await storage.call(db, sql)
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual(expected)
    expect(rows[1]).toEqual(expected)

    const sqlDates = "select strftime('%Y-%m-%d', created_at) as date from stocks"
    const expectedDate = (new Date()).toISOString().split('T')[0]
    const dates = await storage.call(db, sqlDates)
    expect(dates.length).toBe(2)
    expect(dates[0].date).toEqual(expectedDate)
    expect(dates[1].date).toEqual(expectedDate)
  })
})
