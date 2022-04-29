const fs = require('fs')
const path = require('path')

exports.makeRequest = async (url) => {
  return new Promise((resolve, reject) => {
    resolve(fs.readFileSync(path.join('tests', 'reality.txt'), 'utf8'))
  })
}

exports.makeRejectRequest = async (url) => {
  return new Promise((resolve, reject) => {
    reject('chyba')
  })
}

exports.makeEmptyRequest = async (url) => {
  return new Promise((resolve, reject) => {
    resolve(fs.readFileSync(path.join('tests', 'realityEmpty.txt'), 'utf8'))
  })
}
