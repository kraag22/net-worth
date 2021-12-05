exports.makeRequest = async (url) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.goto(url)
  let html = await page.content()

  await browser.close()
  return html
}
