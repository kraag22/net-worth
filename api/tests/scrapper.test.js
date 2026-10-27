const puppeteer = require('puppeteer')
const { makeRequest } = require('../src/reality/scrapper.js')

jest.mock('puppeteer', () => ({ launch: jest.fn() }))

describe('scraper browser cleanup', () => {
  let browser
  let page

  beforeEach(() => {
    page = {
      setUserAgent: jest.fn(),
      goto: jest.fn(),
      type: jest.fn(),
      keyboard: { press: jest.fn() },
      waitForSelector: jest.fn(),
      content: jest.fn().mockResolvedValue('<html>listings</html>'),
    }
    browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn(),
    }
    puppeteer.launch.mockResolvedValue(browser)
  })

  it('returns the page HTML and closes the browser', async () => {
    await expect(makeRequest('https://example.test')).resolves.toBe(
      '<html>listings</html>'
    )
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('closes the browser when navigation fails', async () => {
    page.goto.mockRejectedValue(new Error('Navigation failed'))
    await expect(makeRequest('https://example.test')).rejects.toThrow(
      'Navigation failed'
    )
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('closes the browser when opening a page fails', async () => {
    browser.newPage.mockRejectedValue(new Error('Page failed'))
    await expect(makeRequest('https://example.test')).rejects.toThrow(
      'Page failed'
    )
    expect(browser.close).toHaveBeenCalledTimes(1)
  })
})
