# net-worth
[![Coverage Status](https://coveralls.io/repos/github/kraag22/net-worth/badge.svg?branch=master)](https://coveralls.io/github/kraag22/net-worth?branch=master)

### Development

Use Node.js 26.12.1 (also pinned in `.nvmrc`):

```sh
nvm install
nvm use
cd api
npm ci
npm run test-ci -- --runInBand
npm start
```

The deployment server must also run Node.js 26.12.1 before deploying; the
workflow selects Node for the build runner, not the remote systemd service.
Puppeteer's browser is installed inside `api/node_modules/.cache/puppeteer`
so it is included when the workflow copies the API to the server.

### Settings
To see errors in console, set ```NODE_ENV=develop``` to ```.env``` file.
Stock prices are imported by calling ```POST /import``` from cron, e.g. once
per working day after the US close:
```0 23 * * 1-5 curl -s -X POST localhost:4000/import```.

### Positions

DEGIRO's API is closed, so holdings live in the `positions` table and prices
come from Yahoo Finance (free, ~15 min delayed). `id` is the original DEGIRO
product id, so the existing history stays linked. `symbol` is the Yahoo ticker:
`CEZ.PR` (Prague), `RHM.DE` (Xetra), `ISP.MI` (Milan), `VIE.PA` (Paris),
`AAPL` (US). Its quoted currency must match `currency`, otherwise the position
is skipped and logged.

After a trade, update the position (size `0` when sold out; the sale is
recorded on the next import):

```sh
curl -X POST localhost:4000/positions -H 'Content-Type: application/json' \
  -H "Great-Auth: $api_server_auth_key" \
  -d '{"id":"4798004","symbol":"CEZ.PR","name":"CEZ as","currency":"CZK","size":32}'
```

A new holding without a DEGIRO id can use any unique id. Find a Yahoo ticker
from an ISIN with
`https://query1.finance.yahoo.com/v1/finance/search?q=<ISIN>`.
### Maintenance

#### How to fix missing currency ratios

  + Check quota limit in fixer.io
  + Fill missing ratios with `curl -X PUT localhost:4000/fill-ratios`
  + Check the gap in `stocks_by_daily` table with
      `select distinct date from stocks_by_daily where ratio is null;`
  + Remove incomplete data with ($DATE - 1 before of oldes date in previous command)
      `delete from stocks_by_daily where date > '$DATE';`
  + Compute missing data with `curl -X PUT localhost:4000/fill-daily`
