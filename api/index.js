const DeGiro = require('degiro')

const main = require('./src/main.js')
const storage = require('./src/storage.js')

if (process.env.NODE_ENV !== 'production') {
  console.log('Env variables loaded from .env file.')
  require('dotenv').load()
}

console.log(`Using user: ${process.env.username}`)

const degiro = DeGiro.create({
  username: process.env.username,
  password: process.env.password,
})

storage.connectDb('./data/test.db').then(db => {
  console.log('Connected to the test database.')

  main.importPortfolio(degiro, db)
})
