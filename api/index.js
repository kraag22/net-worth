const DeGiro = require('degiro')
const express = require('express')
const {Fixer} = require('./src/fixer.js')
const data = require('./src/data.js')
const sd = require('./src/stocks_daily.js')
const storage = require('./src/storage.js')
const mustacheExpress = require('mustache-express')
const {logger} = require('./logs.js')

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

storage.connectDb('../data/stocks.db').then(db => {
  console.log('Connected to the database.')

  app.post('/import', async (req, res, next) => {
    try {
      await data.importPortfolio(degiro, db, fixer)
      res.json({status: 'ok'})
    } catch (e) {
      logger.error('API /import failed', e)
      next(e)
    }
  })

  app.put('/fill-ratios', async (req, res, next) => {
    try {
      const datesNo = await data.fillMissingRates(db, fixer)
      res.json({updatedDates: datesNo})
    } catch (e) {
      logger.error('API /fill-ratios failed', e)
      next(e)
    }
  })

  app.put('/fill-daily', async (req, res, next) => {
    try {
      await sd.updateMissing(db)
      res.json({finished: 'ok'})
    } catch (e) {
      logger.error('API /fill-daily failed', e)
      next(e)
    }
  })

  app.get('/portfolio/:groupBy', async (req, res, next) => {
    try {
      const portfolio = await data.groupPortfolio(db, req.params.groupBy)
      res.json({portfolio: portfolio})
    } catch (e) {
      logger.error('API /portfolio/:groupBy failed', e)
      next(e)
    }
  })

  app.get('/', async (req, res, next) => {
    try {
      const indexData = await data.getGraphData(db)
      res.render('index', indexData)
    } catch (e) {
      logger.error('API / failed', e)
      next(e)
    }
  })

  app.get('/script.js', (req, res, next) => {
    try {
      res.render('script')
    } catch (e) {
      logger.error('API /script.js failed', e)
      next(e)
    }
  })

  app.listen(port, () => console.log(`Listening on port ${port}!`))
})
