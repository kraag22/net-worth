const DeGiro = require('degiro')
const express = require('express')
const { Fixer } = require('./src/fixer.js')
const data = require('./src/data.js')
const reality = require('./src/reality/reality.js')
const sd = require('./src/stocks_daily.js')
const storage = require('./src/storage.js')
const mustacheExpress = require('mustache-express')
const { logger } = require('./logs.js')
const c = require('./src/constants.js')
const { makeRequest } = require('./src/reality/scrapper.js')

console.log('Env variables loaded from .env file.')
require('dotenv').config({ path: __dirname + '/../.env' })

const port = process.env.PORT || 4000
const app = express()

app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')

app.use('/static', express.static('public'))

console.log(`Using user: ${process.env.username}`)

const degiro = DeGiro.create({
  username: process.env.username,
  password: process.env.password,
})

const fixer = new Fixer(process.env.fixerkey)

storage.connectDb('../data/stocks.db').then((db) => {
  console.log('Connected to the database.')

  app.post('/import', async (req, res, next) => {
    logger.info('API /import called')
    try {
      await data.importPortfolio(degiro, db, fixer)
      res.json({ status: 'ok' })
    } catch (e) {
      logger.error('API /import failed', e)
      next(e)
    }
  })

  app.put('/fill-ratios', async (req, res, next) => {
    logger.info('API /fill-ratios called')
    try {
      const datesNo = await data.fillMissingRates(db, fixer)
      res.json({ updatedDates: datesNo })
    } catch (e) {
      logger.error('API /fill-ratios failed', e)
      next(e)
    }
  })

  app.put('/fill-balance/:to', async (req, res, next) => {
    logger.info('API /fill-balance called')
    try {
      await sd.updateMissingBalance(db, req.params.to)
      res.json({ seems: 'ok' })
    } catch (e) {
      logger.error('API /fill-balance failed', e)
      next(e)
    }
  })

  app.put('/fill-daily', async (req, res, next) => {
    logger.info('API /fill-daily called')
    try {
      await sd.updateMissing(db)
      res.json({ finished: 'ok' })
    } catch (e) {
      logger.error('API /fill-daily failed', e)
      next(e)
    }
  })

  app.get('/portfolio/:groupBy', async (req, res, next) => {
    logger.info('API /portfolio/:groupBy called')
    try {
      const portfolio = await data.groupPortfolio(db, req.params.groupBy)
      res.json({ portfolio: portfolio })
    } catch (e) {
      logger.error('API /portfolio/:groupBy failed', e)
      next(e)
    }
  })

  app.get('/reality/import', async (req, res, next) => {
    logger.info('API /reality/import called')
    try {
      const status = await reality.storeAveragePrice(
        db,
        makeRequest,
        'jihlava2kk',
        c.jihlava_2_rooms_url
      )
      const status2 = await reality.storeAveragePrice(
        db,
        makeRequest,
        'holesovice3_4kk',
        c.praha_3_4_rooms_url
      )
      const status3 = await reality.storeAveragePrice(
        db,
        makeRequest,
        'holesovice1kk',
        c.praha_1_rooms_url
      )
      res.json({
        statusJihlava: status,
        statusPraha: status2,
        statusPraha1kk: status3,
      })
    } catch (e) {
      logger.error('API /reality/import failed', e)
      next(e)
    }
  })

  app.get('/json/:action', async (req, res, next) => {
    logger.info(`API /json/${req.params.action} called`)
    try {
      const singleData = await data.getData(db, req.params.action)
      res.json(singleData)
    } catch (e) {
      logger.error(`API /json/${req.params.action} failed`, e)
      next(e)
    }
  })

  app.get('/', async (req, res, next) => {
    logger.info('path / called')
    try {
      res.render('index')
    } catch (e) {
      logger.error('API / failed', e)
      next(e)
    }
  })

  app.get('/status', async (req, res, next) => {
    logger.info('path /status called')
    try {
      const state = await data.getImportStatus(db, new Date())
      res.render('status', state)
    } catch (e) {
      logger.error('API /status.html failed', e)
      next(e)
    }
  })

  app.listen(port, () => console.log(`Listening on port ${port}!`))
})
