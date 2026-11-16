// Prices from Yahoo Finance's public chart endpoint (no key, ~15 min delay).
// Symbols use Yahoo suffixes: CEZ.PR (Prague), RHM.DE (Xetra), ISP.MI (Milan),
// AAPL (US).
class Yahoo {
  constructor(http) {
    this.http = http
    this.prefix = 'https://query1.finance.yahoo.com/v8/finance/chart'
  }

  async getPrice(symbol) {
    const url = `${this.prefix}/${encodeURIComponent(
      symbol
    )}?range=1d&interval=1d`
    const response = await this.http.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    })
    const meta = response?.data?.chart?.result?.[0]?.meta
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      throw new Error(`No price returned for ${symbol}`)
    }
    return { price: meta.regularMarketPrice, currency: meta.currency }
  }
}

exports.Yahoo = Yahoo
