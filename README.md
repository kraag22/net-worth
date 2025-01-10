# net-worth
[![Coverage Status](https://coveralls.io/repos/github/kraag22/net-worth/badge.svg?branch=master)](https://coveralls.io/github/kraag22/net-worth?branch=master)

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
