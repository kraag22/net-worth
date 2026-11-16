exports.getCurrencies = (portfolio) => {
  const currencies = new Set()
  portfolio.forEach((item) => {
    currencies.add(item.currency)
  })
  return [...currencies]
}

exports.addCurrencyRateToPortfolio = (portfolio, rates) => {
  return portfolio.map((item) => {
    item.ratio = rates?.[item.currency] ?? null
    return item
  })
}
