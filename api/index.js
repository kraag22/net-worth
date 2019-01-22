const DeGiro = require('degiro')
const express = require('express')
const {Fixer} = require('./src/fixer.js')
const data = require('./src/data.js')
const sd = require('./src/stocks_daily.js')
const storage = require('./src/storage.js')
const mustacheExpress = require('mustache-express')

console.log('Env variables loaded from .env file.')
require('dotenv').config({ path: __dirname + '/../.env' })

const port = process.env.PORT || 4000
const app = express()

app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')

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
      next(e)
    }
  })

  app.put('/fill-ratios', async (req, res, next) => {
    try {
      const datesNo = await data.fillMissingRates(db, fixer)
      res.json({updatedDates: datesNo})
    } catch (e) {
      next(e)
    }
  })

  app.put('/fill-daily', async (req, res, next) => {
    try {
      await sd.updateMissing(db)
      res.json({finished: 'ok'})
    } catch (e) {
      next(e)
    }
  })

  app.get('/portfolio/:groupBy', async (req, res, next) => {
    try {
      const portfolio = await data.groupPortfolio(db, req.params.groupBy)
      res.json({portfolio: portfolio})
    } catch (e) {
      next(e)
    }
  })

  app.get('/', async (req, res, next) => {
    try {
      const indexData = await data.getIndexData(db)
      res.render('index', indexData)
    } catch (e) {
      next(e)
    }
  })

  app.get('/script.js', (req, res, next) => {
    try {
      res.render('script')
    } catch (e) {
      next(e)
    }
  })

  app.listen(port, () => console.log(`Listening on port ${port}!`))
})
