const DeGiro = require('degiro')
const express = require('express')
const {Fixer} = require('./src/fixer.js')
const main = require('./src/main.js')
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
  console.log('Connected to the test database.')

  app.post('/import', async (req, res, next) => {
    try {
      await main.importPortfolio(degiro, db, fixer)
      res.json({status: 'ok'})
    } catch (e) {
      next(e)
    }
  })

  app.get('/portfolio/:groupBy', async (req, res, next) => {
    try {
      const portfolio = await main.groupPortfolio(db, req.params.groupBy)
      res.json({portfolio: portfolio})
    } catch (e) {
      next(e)
    }
  })

  app.get('/', async (req, res, next) => {
    try {
      const data = await main.getIndexData(db)
      res.render('index', data)
    } catch (e) {
      next(e)
    }
  })

  app.listen(port, () => console.log(`Listening on port ${port}!`))
})
