const fs = require('fs')
const path = require('path')
const storage = require('../src/storage.js')
const reality = require('../src/reality/reality.js')
const data = require("../src/reality/data.js")
const {makeRequest, makeRejectRequest, makeEmptyRequest} = require('./mockScrapper.js')

beforeAll(async () => {
  const html = fs.readFileSync(path.join('tests','reality.txt'), 'utf8')
  parsedLines = reality.parseHtml(html)
  db = await storage.connectDb(':memory:')
})

afterAll((done) => {
  db.close(err => {
    expect(err).toBeNull()
    done()
  })
})

describe("reality", () => {
  it("parseHtml() should work", () => {
    expect(parsedLines).toHaveLength(9)
    expect(parsedLines[3].title).toBe('Prodej bytu 2+1&nbsp;43&nbsp;m²')
    expect(parsedLines[3].price).toBe('2&nbsp;850&nbsp;000&nbsp;Kč')
  })

  it("parseFloorSize() should work", () => {
    expect(
      reality.parseFloorSize(parsedLines[3].title)
    ).toBe(43)

    expect(
      reality.parseFloorSize(parsedLines[5].title)
    ).toBe(68)

    expect(reality.parseFloorSize("Prodej bytu 2+1 43&nbsp;m²")).toBe(43)
    expect(reality.parseFloorSize("Prodej bytu 2+1&nbsp;43&nbsp;")).toBe(null)
    expect(reality.parseFloorSize("Prodej bytu 2+1")).toBe(null)
    expect(reality.parseFloorSize("Prodej bytu 1+kk 30&nbsp;m²")).toBe(30)

    expect(reality.parseFloorSize("")).toBe(null)
    expect(reality.parseFloorSize()).toBe(null)
  })

  it("parsePrice() should work", () => {
    expect(
      reality.parsePrice(parsedLines[3].price)
    ).toBe(2_850_000)

    expect(
      reality.parsePrice(parsedLines[5].price)
    ).toBe(3_490_000)

    expect(reality.parsePrice("2&nbsp;850&nbsp;000&nbsp;K")).toBe(null)
    expect(reality.parsePrice("&nbsp;&nbsp;&nbsp;Kč")).toBe(null)
    expect(reality.parsePrice("&nbsp;0&nbsp;000&nbsp;Kč")).toBe(0)
    expect(reality.parsePrice()).toBe(null)
  })

  it("computeAveragePricePerSquareMeter() should work", () => {
    const randomFlat = {
      title:"&nbsp;43&nbsp;m²",
      price: "850&nbsp;000&nbsp;Kč"
    }
    expect(reality.computeAveragePricePerSquareMeter(parsedLines)).toBe(60_689)
    expect(reality.computeAveragePricePerSquareMeter([])).toBeNull()
    expect(reality.computeAveragePricePerSquareMeter([{title:"x", price: "y"}])).toBeNull()
    expect(reality.computeAveragePricePerSquareMeter([randomFlat, randomFlat])).toBeNull()
    expect(reality.computeAveragePricePerSquareMeter(
      [randomFlat, randomFlat, randomFlat]
    )).toBe(19_767)
  })
})

describe("storeAveragePrice", () => {
  it("should work", async () => {
    const result = await reality.storeAveragePrice(db, makeRequest, 'jihlava2kk', 'https://xxx.cz')
    expect(result).toBe("ok")
  })

  it("should handle error well", async () => {
    const result = await reality.storeAveragePrice(db, makeRejectRequest, 'jihlava2kk', 'https://xxx.cz')
    expect(result).toBe("error")
  })

  it("should handle empty input", async () => {
    const result = await reality.storeAveragePrice(db, makeEmptyRequest, 'jihlava2kk', 'https://xxx.cz')
    expect(result).toBe("nothing_inserted")
  })
})

describe("reality data", () => {
  it("getRealityData should work", async () => {
    await storage.insertReality(db, "jezdovice3kk", 23_445)
    await storage.insertReality(db, "jezdovice2kk", 3_445)

    const result = await data.getRealityData(db)
    expect(result[0].jihlava2kk).toBe(60_689)
    expect(result[0].jezdovice3kk).toBe(23_445)
    expect(result[0].jezdovice2kk).toBe(3_445)
  })
})
