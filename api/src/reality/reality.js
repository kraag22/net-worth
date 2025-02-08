const jsdom = require('jsdom')
const { JSDOM } = jsdom
const fs = require('fs')
const { logger } = require('../../logs.js')
const storage = require('../storage.js')

exports.storeAveragePrice = async (db, makeRequest, type, name, url) => {
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
    await storage.insertReality(db, name, type, averagePrice)
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
  const dom = new JSDOM(html, {
    virtualConsole: new jsdom.VirtualConsole(),
  })
  const list = dom.window.document.querySelectorAll(
    'ul[data-e2e="estates-list"] > li'
  )
  const properties = []

  list.forEach((node) => {
    divs = node.querySelectorAll('a div')
    data_div = divs[divs.length - 1]
    if (data_div == undefined) {
      return
    }
    paragraphs = data_div.querySelectorAll('p')
    if (paragraphs.length && paragraphs.length == 3) {
      properties.push({
        title: paragraphs[0].innerHTML,
        price: paragraphs[2].innerHTML,
      })
    }
  })
  return properties
}

exports.parseFloorSize = (title) => {
  const regex = /(\d+)(\s|&nbsp;)m²/
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
