const main = require('../src/main.js')
const {mockDeGiro} = require('./mockDeGiro.js')

describe('getPortfolio()', () => {
  it('works', async () => {
    const ret = await main.getPortfolio(mockDeGiro)
    expect(ret.length).toEqual(15)
  })
})
