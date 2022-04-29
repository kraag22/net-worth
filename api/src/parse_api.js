exports.getItem = (json) => {
  const item = {}
  const save = ['id', 'price', 'size', 'value']
  if (json && json.value && json.name === 'positionrow') {
    json.value.forEach((val) => {
      if (save.includes(val.name)) {
        item[val.name] = val.value
      }
    })
  }

  return item
}

exports.getIds = (portfolio) => portfolio.map((i) => i.id)

exports.getPortfolio = (json) => {
  const data = json && json.portfolio

  if (data && data.length) {
    const portfolio = []
    data.forEach((item) => {
      portfolio.push(exports.getItem(item))
    })
    return portfolio.filter((i) => parseInt(i.id, 10))
  } else {
    return []
  }
}

exports.addMetaToPortfolio = (portfolio, json) => {
  const products = json.data || {}
  return portfolio.map((port) => {
    const meta = products[port.id]
    if (meta) {
      port.currency = meta.currency
      port.name = meta.name
    }
    return port
  })
}

exports.getCurrencies = (portfolio) => {
  const currencies = new Set()
  portfolio.forEach((item) => {
    currencies.add(item.currency)
  })
  return [...currencies]
}

exports.addCurrencyRateToPortfolio = (portfolio, rates) => {
  return portfolio.map((item) => {
    item.ratio = rates[item.currency]
    return item
  })
}
