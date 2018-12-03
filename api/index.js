const DeGiro = require('degiro')
const express = require('express')
const main = require('./src/main.js')
const storage = require('./src/storage.js')

if (process.env.NODE_ENV !== 'production') {
  console.log('Env variables loaded from .env file.')
  require('dotenv').load()
}

const port = process.env.PORT || 4000
const app = express()

console.log(`Using user: ${process.env.username}`)

const degiro = DeGiro.create({
  username: process.env.username,
  password: process.env.password,
})

storage.connectDb('./data/stocks.db').then(db => {
  console.log('Connected to the test database.')

  app.post('/import', async (req, res, next) => {
    try {
      await main.importPortfolio(degiro, db)
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

  app.listen(port, () => console.log(`Listening on port ${port}!`))
})
