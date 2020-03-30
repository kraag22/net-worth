const winston = require('winston')
const path = require('path')

require('dotenv').config({ path: __dirname + '/../.env' })

const rootPath = process.env.logRootPath || './'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [
    new winston.transports.File({ filename: path.join(rootPath, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(rootPath, 'info.log')})
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(rootPath, 'exceptions.log')})
  ]
})

if (process.env.NODE_ENV === 'develop') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

exports.logger = logger
