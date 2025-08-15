const jsdom = require('jsdom')
const { JSDOM } = jsdom
const fs = require('fs')
const { logger } = require('../../logs.js')
const storage = require('../storage.js')
const c = require('../constants.js')

exports.runScrapping = async (db, makeRequest, serverAPICaller) => {
  const status = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'buy',
    'jihlava2kk',
    c.jihlava_2_rooms_url
  )
  const status2 = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'buy',
    'holesovice3_4kk',
    c.praha_3_4_rooms_url
  )
  const status3 = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'buy',
    'holesovice1kk',
    c.praha_1_rooms_url
  )

  const rent1 = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'rent',
    'holesovice3_4kk',
    c.praha_rent_3_4_rooms_url
  )

  const rent2 = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'rent',
    'holesovice2kk',
    c.praha_rent_2_rooms_url
  )

  const rent3 = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'rent',
    'holesovice1kk',
    c.praha_rent_1_rooms_url
  )

  const rent4 = await exports.storeAveragePrice(
    db,
    makeRequest,
    serverAPICaller.postAveragePriceToServer,
    'rent',
    'jihlava2kk',
    c.jihlava_rent_2_rooms_url
  )

  result = {
    statusJihlava: status,
    statusPraha: status2,
    statusPraha1kk: status3,
    rentPraha34kk: rent1,
    rentPraha2kk: rent2,
    rentPraha1kk: rent3,
    rentJihlava2kk: rent4,
  }
  logger.info(result)
  return result
}

exports.storeAveragePrice = async (
  db,
  makeRequest,
  postAveragePriceToServer,
  type,
  name,
  url
) => {
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
    let exported = await postAveragePriceToServer(name, type, averagePrice)
    return exported ? 'ok' : 'not_exported'
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
