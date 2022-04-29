const { JSDOM } = require('jsdom')
const fs = require('fs')
const { logger } = require('../../logs.js')
const storage = require('../storage.js')

exports.storeAveragePrice = async (db, makeRequest, name, url) => {
  let html = ''
  try {
    html = await makeRequest(url)
  } catch (error) {
    logger.error(`Couldnt access url: ${url}`, error)
    return 'error'
  }

  const flats = exports.parseHtml(html)
  const averagePrice = exports.computeAveragePricePerSquareMeter(flats)
  if (averagePrice != null) {
    await storage.insertReality(db, name, averagePrice)
    return 'ok'
  }

  return 'nothing_inserted'
}

exports.computeAveragePricePerSquareMeter = (flats) => {
  const prices = flats
    .map((flat) => {
      const title = exports.parseFloorSize(flat?.title)
      const price = exports.parsePrice(flat?.price)
      if (title && price) {
        return price / title
      }
      return null
    })
    .filter((price) => price != null)

  if (prices?.length > 2) {
    const sum = prices.reduce((previous, current) => previous + current)
    return Math.round(sum / prices.length)
  }

  return null
}

exports.parseHtml = (html) => {
  const dom = new JSDOM(html)
  const list = dom.window.document.querySelectorAll(
    'div.dir-property-list div.property span.basic'
  )
  const properties = []

  list.forEach((node) => {
    properties.push({
      title: node.querySelector('a.title span')?.innerHTML,
      price: node.querySelector('span.price span.norm-price')?.innerHTML,
    })
  })
  return properties
}

exports.parseFloorSize = (title) => {
  const regex = /(\d+)&nbsp;m²/
  const found = title?.match(regex)
  if (found?.length > 1) {
    return parseInt(found[1])
  }
  return null
}

exports.parsePrice = (price) => {
  if (price?.indexOf('Kč') != -1) {
    const parsed = parseInt(price?.replace(/\D/g, ''))
    return isNaN(parsed) ? null : parsed
  }

  return null
}
