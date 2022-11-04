const storage = require('./storage.js')

exports.getOrdersData = async (db) => {
  const sql = `select * from ${storage.EVENTS_TABLE} order by date`
  return storage.call(db, sql)
}

exports.getOrders = (data) => {
  let ids = new Set(data.map((item) => item.id))
  const orders = {}

  ids.forEach(
    (id) =>
      (orders[id] = {
        id: id,
        size: 0,
        price: 0,
        avgRatio: 0,
      })
  )
  const timeline = {}
  let lastOrder = 0

  data.forEach((item) => {
    let priceAdded =
      (item.size - orders[item.id].size) * item.price * item.ratio

    orders[item.id] = {
      size: item.size,
      id: item.id,
      name: item.name,
      price: orders[item.id].price + priceAdded,
      currency: item.currency,
      avgRatio: exports.getAvgCurrencyRatio(
        orders[item.id],
        item.size,
        item.ratio
      ),
    }
    if (timeline[item.date] === undefined) {
      timeline[item.date] = lastOrder
    }
    timeline[item.date] += Math.round(priceAdded)
    lastOrder = timeline[item.date]
  })
  return { timeline, orders }
}

exports.getTotalOrder = (orderData) => {
  const lastDate = Object.keys(orderData).pop()
  return Math.round(orderData[lastDate])
}

// avg currency rate to CZK thu orders
exports.getAvgCurrencyRatio = (lastOrder, size, ratio) => {
  let added = size - lastOrder.size
  if (added > 0) {
    avgRatio = (lastOrder.size * lastOrder.avgRatio + added * ratio) / size
  } else {
    avgRatio = lastOrder.avgRatio
  }
  return avgRatio
}
