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

  // Daily closes from `from` (YYYY-MM-DD) until now: { currency,
  // closes: { 'YYYY-MM-DD': price } } in the exchange's own dates. Closes are
  // adjusted for later splits, like the sizes kept in the history.
  async getHistory(symbol, from) {
    const period1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000)
    const period2 = Math.floor(Date.now() / 1000)
    const url =
      `${this.prefix}/${encodeURIComponent(symbol)}?period1=${period1}` +
      `&period2=${period2}&interval=1d`
    const response = await this.http.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000,
    })
    const result = response?.data?.chart?.result?.[0]
    if (!result?.meta || !Array.isArray(result.timestamp)) {
      throw new Error(`No price history returned for ${symbol}`)
    }
    const offset = result.meta.gmtoffset ?? 0
    const closes = {}
    const quoteCloses = result.indicators?.quote?.[0]?.close ?? []
    result.timestamp.forEach((ts, index) => {
      const close = quoteCloses[index]
      if (typeof close !== 'number') return
      const date = new Date((ts + offset) * 1000).toISOString().slice(0, 10)
      closes[date] = close
    })
    return { currency: result.meta.currency, closes }
  }
}

exports.Yahoo = Yahoo
