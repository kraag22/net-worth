const puppeteer = require('puppeteer')

exports.makeRequest = async (url) => {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  await page.goto('https://login.szn.cz', { waitUntil: 'networkidle0' })

  await page.type('#login-username', process.env.seznam_email)
  await page.keyboard.press('Enter')
  await page.type('#login-password', process.env.seznam_password)
  await page.keyboard.press('Enter')

  await page.waitForSelector('span.bullet')

  await page.goto(url, { waitUntil: 'networkidle0' })
  let html = await page.content()

  await browser.close()
  return html
}
