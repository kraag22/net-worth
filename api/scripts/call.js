#!/usr/bin/env node
// Calls an API endpoint of the running server with api_server_auth_key from
// ../../.env in the Great-Auth header, so cron needs no key in the crontab:
//
//   node /path/to/api/scripts/call.js POST /import
//   node /path/to/api/scripts/call.js PUT '/fill-daily?from=2024-09-01'
//
// The server is http://localhost:$PORT (default 4000) unless API_URL is set.
// Prints the response; exits with 1 when the request fails.
require('dotenv').config({ path: `${__dirname}/../../.env`, quiet: true })

const main = async () => {
  const [method, path] = process.argv.slice(2)
  if (!method || !path || !path.startsWith('/')) {
    console.error('Usage: node scripts/call.js <METHOD> </path>')
    process.exit(2)
  }
  const key = process.env.api_server_auth_key
  if (!key) {
    console.error('api_server_auth_key is not set in .env')
    process.exit(2)
  }
  const base =
    process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`
  const response = await fetch(`${base}${path}`, {
    method: method.toUpperCase(),
    headers: { 'Great-Auth': key },
  })
  const body = await response.text()
  const line = `${new Date().toISOString()} ${method.toUpperCase()} ${path} ${
    response.status
  } ${body}`
  if (!response.ok) {
    console.error(line)
    process.exit(1)
  }
  console.log(line)
}

main().catch((e) => {
  console.error(
    `${new Date().toISOString()} ${process.argv.slice(2).join(' ')} failed: ${
      e.message
    }`
  )
  process.exit(1)
})
