const express = require('express')
const schedule = require('node-schedule')
const axios = require('axios')
const { Fixer } = require('./src/fixer.js')
const { Yahoo } = require('./src/yahoo.js')
const { ServerAPICaller } = require('./src/api_caller.js')
const data = require('./src/data.js')
const reality = require('./src/reality/reality.js')
const sd = require('./src/stocks_daily.js')
const storage = require('./src/storage.js')
const ingest = require('./src/ingest.js')
const backfill = require('./src/backfill.js')
const mustacheExpress = require('mustache-express')
const { logger } = require('./logs.js')
const c = require('./src/constants.js')
const { makeRequest } = require('./src/reality/scrapper.js')
const {
  is_request_authenticated,
  is_session_valid,
  check_password,
  set_session_cookie,
  require_login,
  SESSION_COOKIE,
} = require('./src/authentication.js')

console.log('Env variables loaded from .env file.')
require('dotenv').config({ path: __dirname + '/../.env' })

const port = process.env.PORT || 4000
const app = express()

app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')

// The ingest form posts a whole DEGIRO CSV export.
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(express.json())
app.use('/static', express.static('public'))
// Behind a local reverse proxy, so req.secure reflects the original HTTPS.
app.set('trust proxy', 'loopback')

app.get('/login', (req, res) => {
  if (is_session_valid(req)) return res.redirect('/')
  res.render('login', {})
})

app.post('/login', (req, res) => {
  if (!check_password(req.body.password)) {
    logger.info('Failed login attempt')
    return res.status(401).render('login', { error: 'Wrong password' })
  }
  set_session_cookie(req, res)
  res.redirect('/')
})

app.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE)
  res.redirect('/login')
})

// Pages and the data they load require a logged-in browser session.
app.use(['/json', '/portfolio', '/status', '/ingest'], require_login)
app.get('/', require_login)

const yahoo = new Yahoo(axios)

const serverAPICaller = new ServerAPICaller(
  process.env.api_server_url,
  process.env.api_server_auth_key
)

const fixer = new Fixer(process.env.fixerkey)

storage
  .connectDb('../data/stocks.db')
  .then((db) => {
    console.log('Connected to the database.')

    if (process.env.schedule_reality_import === 'true') {
      const job = schedule.scheduleJob('10 1 * * *', async function () {
        logger.info('Reality scrapping started')
        await reality.runScrapping(db, makeRequest, serverAPICaller)
      })
      logger.info('Reality import job scheduled')
    }

    app.post('/import', async (req, res, next) => {
      logger.info('API /import called')
      try {
        await data.importPortfolio(yahoo, db, fixer)
        res.json({ status: 'ok' })
      } catch (e) {
        logger.error('API /import failed', e)
        next(e)
      }
    })

    app.post('/positions', async (req, res, next) => {
      try {
        if (!is_request_authenticated(req)) {
          return res.status(401).json({ error: 'Unauthorized' })
        }

        const error = data.validatePosition(req.body)
        if (error) {
          return res.status(400).json({ error })
        }

        logger.info(
          `API /positions called with ${req.body.id} ${req.body.symbol} ${req.body.size}`
        )
        await storage.upsertPosition(db, req.body)
        res.json({ status: 'ok' })
      } catch (e) {
        logger.error('API /positions failed', e)
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
      const { from } = req.query
      if (from !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        return res.status(400).json({ error: 'from must be YYYY-MM-DD' })
      }
      try {
        const result = await backfill.fillDaily(db, yahoo, { from })
        logger.info(
          `Backfilled ${result.inserted} stocks rows, corrected ` +
            `${result.corrected}, daily from ${result.dailyFrom}`
        )
        res.json({ finished: 'ok', ...result })
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
        let jsonResponse = await reality.runScrapping(
          db,
          makeRequest,
          serverAPICaller
        )
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

    const renderIngest = async (res, data, status = 200) => {
      const state = await ingest.pageState(db).catch(() => ({}))
      res.status(status).render('ingest', { ...state, ...data })
    }

    app.get('/ingest', async (req, res, next) => {
      try {
        await renderIngest(res, {})
      } catch (e) {
        logger.error('path /ingest failed', e)
        next(e)
      }
    })

    app.post('/ingest/preview', async (req, res, next) => {
      const csv = req.body.csv
      try {
        const preview = await ingest.preview(db, csv)
        await renderIngest(res, ingest.previewView(preview, csv))
      } catch (e) {
        logger.info(`Ingest preview failed: ${e.message}`)
        await renderIngest(res, { csv, error: e.message }, 400)
      }
    })

    // Initial population of transactions and positions from history.
    app.post('/ingest/from-daily', async (req, res, next) => {
      try {
        const result = await ingest.populateFromDaily(db)
        logger.info(
          `Populated ${result.inserted} transactions from stocks_by_daily`
        )
        await renderIngest(res, {
          result: {
            ...result,
            hasChanges: result.changes.length > 0,
            hasCreated: result.created.length > 0,
            filledCount: result.filled.length,
          },
        })
      } catch (e) {
        logger.info(`Populating from stocks_by_daily failed: ${e.message}`)
        await renderIngest(res, { error: e.message }, 400)
      }
    })

    app.post('/ingest/symbols', async (req, res, next) => {
      try {
        const updated = await ingest.setSymbols(
          db,
          ingest.parseSymbolsForm(req.body)
        )
        logger.info(`Set Yahoo symbol of ${updated} positions`)
        await renderIngest(res, { symbolsUpdated: updated })
      } catch (e) {
        logger.error('path /ingest/symbols failed', e)
        next(e)
      }
    })

    app.post('/ingest', async (req, res, next) => {
      const csv = req.body.csv
      try {
        const result = await ingest.ingest(
          db,
          csv,
          ingest.parseIngestForm(req.body)
        )
        logger.info(`Ingested ${result.inserted} transactions`)
        await renderIngest(res, {
          result: { ...result, hasChanges: result.changes.length > 0 },
        })
      } catch (e) {
        logger.info(`Ingest failed: ${e.message}`)
        try {
          const preview = await ingest.preview(db, csv)
          await renderIngest(
            res,
            { ...ingest.previewView(preview, csv), error: e.message },
            400
          )
        } catch (e2) {
          await renderIngest(res, { csv, error: e.message }, 400)
        }
      }
    })

    app.listen(port, () => console.log(`Listening on port ${port}!`))
  })
  .catch((e) => {
    console.error('Failed to connect to the database:', e)
    throw e
  })
