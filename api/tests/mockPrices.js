const storage = require('../src/storage.js')

// Portfolio from the former DEGIRO fixture (portfolio.json + products.json)
exports.positions = [
  {
    id: '5212042',
    symbol: 'STOCK.PR',
    name: 'Stock Spirits Group',
    currency: 'CZK',
    size: 53,
    price: 59,
  },
  {
    id: '332111',
    symbol: 'MSFT',
    name: 'Microsoft Corp',
    currency: 'USD',
    size: 2,
    price: 106.16,
  },
  {
    id: '13200994',
    symbol: 'SNAP',
    name: 'Snap',
    currency: 'USD',
    size: 25,
    price: 6.82,
  },
  {
    id: '14660208',
    symbol: 'AVST.PR',
    name: 'AVAST PLC',
    currency: 'CZK',
    size: 40,
    price: 86.5,
  },
  {
    id: '4798008',
    symbol: 'KOMB.PR',
    name: 'Komercni Banka AS',
    currency: 'CZK',
    size: 4,
    price: 870,
  },
  {
    id: '4798013',
    symbol: 'PEGAS.PR',
    name: 'Pegas Nonwovens SA',
    currency: 'CZK',
    size: 5,
    price: 900,
  },
  {
    id: '8565591',
    symbol: 'KOFOL.PR',
    name: 'KOFOLA CS',
    currency: 'CZK',
    size: 11,
    price: 292,
  },
  {
    id: '4798015',
    symbol: 'ERBAG.PR',
    name: 'Erste Group Bank AG',
    currency: 'CZK',
    size: 7,
    price: 904.8,
  },
  {
    id: '331868',
    symbol: 'AAPL',
    name: 'Apple Inc',
    currency: 'USD',
    size: 1,
    price: 207.48,
  },
  {
    id: '4798004',
    symbol: 'CEZ.PR',
    name: 'CEZ',
    currency: 'CZK',
    size: 10,
    price: 549,
  },
  {
    id: '1533610',
    symbol: 'META',
    name: 'Facebook',
    currency: 'USD',
    size: 2,
    price: 150.35,
  },
  {
    id: '10306755',
    symbol: 'MONET.PR',
    name: 'MONETA MONEY BANK',
    currency: 'CZK',
    size: 67,
    price: 78.5,
  },
  {
    id: '890163',
    symbol: 'NOA3.DE',
    name: 'NOKIA OYJ A ADR 1/EO-,06',
    currency: 'EUR',
    size: 30,
    price: 5.1,
  },
  {
    id: '4667924',
    symbol: 'USDCASH',
    name: 'USD Cash Fund FundShare',
    currency: 'USD',
    size: 0,
    price: 1.0097,
  },
  {
    id: '5199326',
    symbol: 'CZKCASH',
    name: 'CZK Cash Fund FundShare',
    currency: 'CZK',
    size: 186.0214,
    price: 1.0003,
  },
]

exports.insertPositions = async (db, positions = exports.positions) => {
  for (const position of positions) {
    await storage.upsertPosition(db, position)
  }
}

class MockPrices {
  constructor(positions = exports.positions) {
    this.quotes = {}
    positions.forEach((p) => {
      this.quotes[p.symbol] = { price: p.price, currency: p.currency }
    })
  }

  async getPrice(symbol) {
    if (!this.quotes[symbol]) {
      throw new Error(`No price returned for ${symbol}`)
    }
    return this.quotes[symbol]
  }
}

exports.MockPrices = MockPrices
exports.mockPrices = new MockPrices()
