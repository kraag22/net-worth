const DeGiro = require('degiro')
const express = require('express')
const schedule = require('node-schedule')
const { Fixer } = require('./src/fixer.js')
const { ServerAPICaller } = require('./src/api_caller.js')
const data = require('./src/data.js')
const reality = require('./src/reality/reality.js')
const sd = require('./src/stocks_daily.js')
const storage = require('./src/storage.js')
const mustacheExpress = require('mustache-express')
const { logger } = require('./logs.js')
const c = require('./src/constants.js')
const { makeRequest } = require('./src/reality/scrapper.js')
const { is_request_authenticated } = require('./src/authentication.js')

console.log('Env variables loaded from .env file.')
require('dotenv').config({ path: __dirname + '/../.env' })

const port = process.env.PORT || 4000
const app = express()

app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use('/static', express.static('public'))

console.log(`Using user: ${process.env.username}`)

const degiro = DeGiro.create({
  username: process.env.username,
  password: process.env.password,
})

const serverAPICaller = new ServerAPICaller(
  process.env.api_server_url,
  process.env.api_server_auth_key
)

const fixer = new Fixer(process.env.fixerkey)

storage
  .connectDb('../data/stocks.db')
  .then((db) => {
    console.log('Connected to the database.')

    if (process.env.schedule_reality_import) {
      const job = schedule.scheduleJob('10 1 * * *', async function() {
        logger.info('Reality scrapping started');
        await reality.runScrapping(db, makeRequest, serverAPICaller)
      });
      logger.info("Reality import job scheduled")
    }

    app.post('/login', async (req, res, next) => {
      logger.info('API /login called')
      try {
        await degiro.login(req.body.smscode)

        res.json({ status: 'ok' })
      } catch (e) {
        logger.error('API /login failed', e)
        next(e)
      }
    })

    app.get('/refresh', async (req, res, next) => {
      logger.info('API /refresh called')
      try {
        await degiro.getPortfolio()
        res.json({ status: 'ok' })
      } catch (e) {
        logger.error('API /refresh failed', e)
        next(e)
      }
    })

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

    app.post('/reality/store_data', async (req, res, next) => {
      try {
        if (!is_request_authenticated(req)) {
          return res.status(401).json({ error: 'Unauthorized' })
        }

        const { name, type, averagePrice } = req.body
        logger.info(
          `API /reality/store_data called with ${name}-${type} ${averagePrice}`
        )

        await storage.insertReality(db, name, type, averagePrice)

        res.json({ status: 'ok' })
      } catch (e) {
        logger.error('API /portfolio/:groupBy failed', e)
        next(e)
      }
    })

    app.get('/reality/import', async (req, res, next) => {
      logger.info('API /reality/import called')
      try {
        let jsonResponse = await reality.runScrapping(db, makeRequest, serverAPICaller)
        res.json(jsonResponse)
      } catch (e) {
        logger.error('API /reality/import failed', e)
        next(e)
      }
    })

    app.get('/json/:action', async (req, res, next) => {
      logger.info(`API /json/${req.params.action} called`)
      try {
        const singleData = await data.getData(db, req.params.action, req.query)
        res.json(singleData)
      } catch (e) {
        logger.error(`API /json/${req.params.action} failed`, e)
        next(e)
      }
    })

    app.get('/', async (req, res, next) => {
      logger.info('path / called')
      try {
        let stockIds = await data.getStockIds(db)
        res.render('index', { stockIds: stockIds })
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
  .catch((e) => {
    console.error('Failed to connect to the database:', e)
    throw e
  })
