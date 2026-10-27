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
To turn on debuging for Degiro module, set ```DEGIRO_DEBUG=true``` to ```.env``` file.
### Maintenance

#### How to fix missing currency ratios

  + Check quota limit in fixer.io
  + Fill missing ratios with `curl -X PUT localhost:4000/fill-ratios`
  + Check the gap in `stocks_by_daily` table with
      `select distinct date from stocks_by_daily where ratio is null;`
  + Remove incomplete data with ($DATE - 1 before of oldes date in previous command)
      `delete from stocks_by_daily where date > '$DATE';`
  + Compute missing data with `curl -X PUT localhost:4000/fill-daily`
