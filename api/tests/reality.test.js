const fs = require('fs')
const path = require('path')
const storage = require('../src/storage.js')
const reality = require('../src/reality/reality.js')
const data = require('../src/reality/data.js')
const {
  makeRequest,
  makeRejectRequest,
  makeEmptyRequest,
} = require('./mockScrapper.js')

beforeAll(async () => {
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close((err) => {
    expect(err).toBeNull()
    done()
  })
})

describe('reality - buy', () => {
  beforeAll(async () => {
    const html = fs.readFileSync(path.join('tests', 'reality.txt'), 'utf8')
    parsedLines = reality.parseHtml(html)
  })

  it('parseHtml() should work', () => {
    expect(parsedLines).toHaveLength(12)
    expect(parsedLines[3].title).toBe('Prodej bytu 1+kk 34 m²')
    expect(parsedLines[3].price).toBe('6 499 000 Kč')
  })

  it('parseFloorSize() should work', () => {
    expect(reality.parseFloorSize(parsedLines[3].title)).toBe(34)

    expect(reality.parseFloorSize(parsedLines[5].title)).toBe(26)

    expect(reality.parseFloorSize('Prodej bytu 1+kk 34 m²')).toBe(34)
    expect(reality.parseFloorSize('Prodej bytu 2+1 43&nbsp;m²')).toBe(43)
    expect(reality.parseFloorSize('Prodej bytu 2+1&nbsp;43&nbsp;')).toBe(null)
    expect(reality.parseFloorSize('Prodej bytu 2+1')).toBe(null)
    expect(reality.parseFloorSize('Prodej bytu 1+kk 30&nbsp;m²')).toBe(30)

    expect(reality.parseFloorSize('')).toBe(null)
    expect(reality.parseFloorSize()).toBe(null)
  })

  it('parsePrice() should work', () => {
    expect(reality.parsePrice(parsedLines[3].price)).toBe(6_499_000)

    expect(reality.parsePrice(parsedLines[5].price)).toBe(4_690_000)

    expect(reality.parsePrice('2&nbsp;850&nbsp;000&nbsp;K')).toBe(null)
    expect(reality.parsePrice('&nbsp;&nbsp;&nbsp;Kč')).toBe(null)
    expect(reality.parsePrice('&nbsp;0&nbsp;000&nbsp;Kč')).toBe(0)
    expect(reality.parsePrice()).toBe(null)
  })

  it('computeAveragePricePerSquareMeter() should work', () => {
    const randomFlat = {
      title: '&nbsp;43&nbsp;m²',
      price: '850&nbsp;000&nbsp;Kč',
    }
    expect(reality.computeAveragePricePerSquareMeter(parsedLines)).toBe(183398)
    expect(reality.computeAveragePricePerSquareMeter([])).toBeNull()
    expect(
      reality.computeAveragePricePerSquareMeter([{ title: 'x', price: 'y' }])
    ).toBeNull()
    expect(
      reality.computeAveragePricePerSquareMeter([randomFlat, randomFlat])
    ).toBeNull()
    expect(
      reality.computeAveragePricePerSquareMeter([
        randomFlat,
        randomFlat,
        randomFlat,
      ])
    ).toBe(19_767)
  })
})

describe('reality - rent', () => {
  beforeAll(async () => {
    const html = fs.readFileSync(path.join('tests', 'reality.rent.txt'), 'utf8')
    parsedLines = reality.parseHtml(html)
  })

  it('parseHtml() should work', () => {
    expect(parsedLines).toHaveLength(12)
    expect(parsedLines[3].title).toBe('Pronájem bytu 2+kk 60&nbsp;m²')
    expect(parsedLines[3].price).toBe('11&nbsp;000&nbsp;Kč/měsíc')
  })

  it('parseFloorSize() should work', () => {
    expect(reality.parseFloorSize(parsedLines[3].title)).toBe(60)
  })

  it('parsePrice() should work', () => {
    expect(reality.parsePrice(parsedLines[3].price)).toBe(11_000)
  })

  it('computeAveragePricePerSquareMeter() should work', () => {
    const randomFlat = {
      title: 'Pronájem bytu 3+1&nbsp;80&nbsp;m²',
      price: '35&nbsp;000&nbsp;Kč za měsíc',
    }
    expect(reality.computeAveragePricePerSquareMeter(parsedLines)).toBe(244)

    expect(
      reality.computeAveragePricePerSquareMeter([
        randomFlat,
        randomFlat,
        randomFlat,
      ])
    ).toBe(438)
  })
})

describe('storeAveragePrice', () => {
  it('should work', async () => {
    const result = await reality.storeAveragePrice(
      db,
      makeRequest,
      'jihlava2kk',
      'https://xxx.cz'
    )
    expect(result).toBe('ok')
  })

  it('should handle error well', async () => {
    const result = await reality.storeAveragePrice(
      db,
      makeRejectRequest,
      'jihlava2kk',
      'https://xxx.cz'
    )
    expect(result).toBe('error')
  })

  it('should handle empty input', async () => {
    const result = await reality.storeAveragePrice(
      db,
      makeEmptyRequest,
      'jihlava2kk',
      'https://xxx.cz'
    )
    expect(result).toBe('nothing_inserted')
  })
})

describe('reality data', () => {
  it('getRealityData should work', async () => {
    let sql = `INSERT INTO ${storage.REALITY_TABLE} `
    sql += '(name, price, type, created_at) VALUES (?,?,?,?)'

    await storage.insert(db, sql, [
      'jihlava2kk',
      61_000,
      'buy',
      '2021-12-25 13:23:40',
    ])
    await storage.insert(db, sql, ['jezdovice3kk', 23_445, 'buy', '2021-12-15'])
    await storage.insert(db, sql, ['jezdovice2kk', 3_445, 'buy', '2021-12-15'])
    await storage.insert(db, sql, ['jihlava2kk', 60_000, 'buy', '2021-12-15'])
    await storage.insert(db, sql, ['jihlava2kk', 600, 'rent', '2021-12-15'])
    await storage.insert(db, sql, [
      'jihlava2kk',
      61_001,
      'buy',
      '2021-12-25 13:33:40',
    ])

    const result = await data.getRealityData(db, 'buy')
    expect(result[0].jihlava2kk).toBe(60_000)
    expect(result[0].jezdovice3kk).toBe(23_445)
    expect(result[0].jezdovice2kk).toBe(3_445)
    expect(result[0].date).toBe('2021-12-15')
    expect(result[1].date).toBe('2021-12-25')
    expect(result[1].jihlava2kk).toBe(61_001)

    const resultRent = await data.getRealityData(db, 'rent')
    expect(resultRent[0].jihlava2kk).toBe(600)
  })
})
