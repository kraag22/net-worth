const fs = require('fs')
var path = require('path')
const reality = require('../src/reality/reality.js')

beforeAll(() => {
    const html = fs.readFileSync(path.join('tests','reality.txt'), 'utf8')
    parsedLines = reality.parseHtml(html)
})

describe("parsing data", () => {
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

    expect(reality.parseFloorSize("Prodej bytu 2+1 43&nbsp;m²")).toBe(null)
    expect(reality.parseFloorSize("Prodej bytu 2+1&nbsp;43&nbsp;")).toBe(null)
    expect(reality.parseFloorSize("Prodej bytu 2+1")).toBe(null)
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
    expect(reality.computeAveragePricePerSquareMeter(parsedLines)).toBe(59_635)
    expect(reality.computeAveragePricePerSquareMeter([])).toBeNull()
    expect(reality.computeAveragePricePerSquareMeter([{title:"x", price: "y"}])).toBeNull()
    expect(reality.computeAveragePricePerSquareMeter([randomFlat, randomFlat])).toBeNull()
    expect(reality.computeAveragePricePerSquareMeter(
      [randomFlat, randomFlat, randomFlat]
    )).toBe(19_767)
  })
})
