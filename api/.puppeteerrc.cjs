const path = require('node:path')

module.exports = {
  // Keep the browser with the dependencies copied by the deployment workflow.
  cacheDirectory: path.join(__dirname, 'node_modules', '.cache', 'puppeteer'),
}
