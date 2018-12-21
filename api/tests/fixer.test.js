const {Fixer} = require('../src/fixer.js')
const rates = require('./rates.json')

let fixer = null

beforeAll(async () => {
  fixer = new Fixer()
})

describe('Fixer function', () => {
  it('changeBase() should work', async () => {

    const expected = {}
    const result = fixer.changeBase(rates.rates, 'CZK')
    expect(Object.keys(result).length).toEqual(7)
    expect(result['CZK']).toEqual(1)

    expect(Math.round(result['USD'] * 100) / 100).toEqual(22.48)
    expect(Math.round(result['EUR'] * 100) / 100).toEqual(25.79)
  })
})
