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

The daily Sreality scraper runs at 01:10 in the server's timezone only when
`schedule_reality_import=true`. Set it to `false` or leave it unset to disable
the scheduled scraper. Restart the API after changing this setting.

The web UI (`/`, `/status`, `/json/*`, `/portfolio/*`) asks for a password set
as ```login_password=...``` in the ```.env``` file. Without it nobody can log in.
After login a cookie keeps the browser logged in (it is refreshed on every
visit); changing the password logs everyone out.
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

After a trade, ingest the DEGIRO CSV on `/ingest` (see below), it updates
the positions and keeps the transactions complete. A position can also be
updated directly (size `0` when sold out; the sale is recorded on the next
import), but then its transactions no longer add up to its size and
`/fill-daily` leaves its rows alone until a CSV ingest brings them together:

```sh
curl -X POST localhost:4000/positions -H 'Content-Type: application/json' \
  -H "Great-Auth: $api_server_auth_key" \
  -d '{"id":"4798004","symbol":"CEZ.PR","name":"CEZ as","currency":"CZK","size":32}'
```

A new holding without a DEGIRO id can use any unique id. Find a Yahoo ticker
from an ISIN with
`https://query1.finance.yahoo.com/v1/finance/search?q=<ISIN>`.
### Ingesting DEGIRO transactions

Open `/ingest`. The first time, while the `transactions` table is empty, press
"Populate from history" (`POST /ingest/from-daily`): every size change in
`stocks_by_daily` becomes a transaction dated at the end of that day and
positions get the latest recorded sizes. Held stocks missing in `positions`
are created without a Yahoo symbol; fill the symbols in on the same page (the
price import skips positions without one). It can be re-run until the first
CSV ingest; it replaces the transactions it derived before.

Then choose the DEGIRO export (Activity → Transactions → Export CSV) and
preview. Only transactions newer than the last ingested one are shown. Unknown
ISINs are matched to a position once (or create a new one with a Yahoo symbol,
or are ignored); the ISIN is then stored on the position. Unchecked rows are
recorded in the `transactions` table but don't change sizes.

Then bring the history in line with the transactions with
`curl -X PUT localhost:4000/fill-daily` (optionally `?from=YYYY-MM-DD`):
every day since the first transaction without any price import gets one
`stocks` row per held position (Yahoo daily close, FX from Yahoo's
`USDCZK=X`/`EURCZK=X`), rows imported after the history-derived transactions
get their sizes corrected and held positions missing on such a day are added.
Then `events` are rebuilt and `stocks_by_daily` is recomputed for the changed
days. Positions without usable Yahoo history (no symbol, sold and gone from
`positions`, WBD after its restructuring, or Yahoo closes more than 30 % off
the stored price) are estimated between their stored prices and listed in
the response under `estimated`. Nothing is written when a day can't be
priced. Running it again is cheap: only new gaps or changes are filled.
Positions whose size in `positions` differs from the sum of their
transactions (changed with `POST /positions`) are listed under `inconsistent`
and their imported rows are not corrected.

### Maintenance

#### How to fix missing currency ratios

  + Check quota limit in fixer.io
  + Fill missing ratios with `curl -X PUT localhost:4000/fill-ratios`
  + Check the gap in `stocks_by_daily` table with
      `select distinct date from stocks_by_daily where ratio is null;`
  + Remove incomplete data with ($DATE - 1 before of oldes date in previous command)
      `delete from stocks_by_daily where date > '$DATE';`
  + Compute missing data with `curl -X PUT localhost:4000/fill-daily`
    (it also fills days missing in `stocks`, see Ingesting DEGIRO transactions)
