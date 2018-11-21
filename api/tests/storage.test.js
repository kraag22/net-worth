const storage = require('../src/storage.js')
const sqlite3 = require('sqlite3')

let db = null;

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
    await storage.insert(db, [expected, expected])

    const rows = await storage.call(db, "select * from stocks")
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual(expected)
    expect(rows[1]).toEqual(expected)
  })
})
