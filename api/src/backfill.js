const storage = require('./storage.js')
const data = require('./data.js')
const sd = require('./stocks_daily.js')
const { logger } = require('../logs.js')

// Time (UTC) of the stocks rows created for a day without any import; the
// row carries that day's close.
const BACKFILL_TIME = '22:00:00'

const DAY_MS = 24 * 60 * 60 * 1000

exports.addDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)

exports.dateRange = (from, to) => {
  const dates = []
  for (let date = from; date <= to; date = exports.addDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

// position id -> [{ datetime, size }] cumulative sizes, oldest first
const sizeTimelines = (transactions) => {
  const timelines = new Map()
  transactions.forEach((trn) => {
    const timeline = timelines.get(trn.position_id) ?? []
    const previous = timeline.length ? timeline[timeline.length - 1].size : 0
    // rounding keeps 0.1 + 0.2 style sums comparable
    const size = Math.round((previous + trn.size) * 1e6) / 1e6
    timeline.push({ datetime: trn.datetime, size })
    timelines.set(trn.position_id, timeline)
  })
  return timelines
}

const sizeAt = (timeline, datetime) => {
  let size = 0
  for (const entry of timeline) {
    if (entry.datetime > datetime) break
    size = entry.size
  }
  return size
}

// Latest close on or before the date (weekends and holidays carry the
// previous trading day's close).
exports.closeOn = (closes, date) => {
  let best = null
  for (const [day, close] of Object.entries(closes)) {
    if (day <= date && (best === null || day > best)) best = day
  }
  return best === null ? null : closes[best]
}

// What has to change in `stocks` so it matches the transactions, from the
// first transaction (or `from`) until yesterday (or `to`):
// - days without any stocks row get one row per held position
// - rows imported after the history-derived transactions get the size from
//   the transactions, and held positions missing on such a day are added
exports.plan = async (db, { from, to } = {}) => {
  const transactions = await storage.call(
    db,
    `select position_id, datetime, size from ${storage.TRANSACTIONS_TABLE} ` +
      'where applied = 1 and position_id is not null order by datetime'
  )
  if (transactions.length === 0) return null

  const derived = await storage.call(
    db,
    `select max(datetime) as cutoff from ${storage.TRANSACTIONS_TABLE} ` +
      'where source = ?',
    ['stocks_by_daily']
  )
  // stocks rows up to the cutoff are what the transactions were derived from
  const cutoff = derived[0].cutoff ?? ''
  const start = from ?? transactions[0].datetime.slice(0, 10)
  const end = to ?? exports.addDays(data.getDateString(new Date()), -1)
  if (start > end) return null

  const imported = await storage.call(
    db,
    "select distinct strftime('%Y-%m-%d', created_at) as day " +
      `from ${storage.STOCKS_TABLE} where created_at >= ? and created_at <= ?`,
    [start, `${end} 23:59:59`]
  )
  const importedDays = new Set(imported.map((row) => row.day))
  // rows that may need a correction
  const newer = await storage.call(
    db,
    'select rowid, id, size, price, ratio, created_at ' +
      `from ${storage.STOCKS_TABLE} where created_at > ? and created_at >= ? ` +
      'and created_at <= ? order by created_at, rowid',
    [cutoff, start, `${end} 23:59:59`]
  )
  const newerByDay = new Map()
  newer.forEach((row) => {
    const day = row.created_at.slice(0, 10)
    newerByDay.set(day, [...(newerByDay.get(day) ?? []), row])
  })

  const timelines = sizeTimelines(transactions)
  // Positions whose size was changed without transactions (POST /positions):
  // their imported rows follow the positions table, so they are not
  // corrected nor completed until a CSV ingest brings the two together.
  const positions = await storage.call(
    db,
    `select id, name, size from ${storage.POSITIONS_TABLE}`
  )
  const inconsistent = positions
    .map((p) => {
      const timeline = timelines.get(p.id) ?? []
      const transactions = timeline.length
        ? timeline[timeline.length - 1].size
        : 0
      return { id: p.id, name: p.name, positions: p.size, transactions }
    })
    .filter(
      (p) =>
        timelines.has(p.id) && Math.abs(p.positions - p.transactions) > 1e-6
    )
  const untouched = new Set(inconsistent.map((p) => p.id))
  const inserts = [] // { id, size, date, createdAt, required }
  const updates = [] // { rowid, size, price, ratio, date }
  exports.dateRange(start, end).forEach((date) => {
    const imports = importedDays.has(date)
    const dayRows = newerByDay.get(date) ?? []
    if (imports && dayRows.length === 0) return

    const endOfDay = `${date} 23:59`
    const endOfPreviousDay = `${exports.addDays(date, -1)} 23:59`
    // held that day, or sold that day (a size 0 row records the sale)
    const held = [...timelines.entries()]
      .map(([id, timeline]) => ({
        id,
        size: sizeAt(timeline, endOfDay),
        before: sizeAt(timeline, endOfPreviousDay),
      }))
      .filter((p) => p.size > 0 || p.before > 0)

    if (!imports) {
      held.forEach((p) =>
        inserts.push({
          id: p.id,
          size: p.size,
          date,
          createdAt: `${date} ${BACKFILL_TIME}`,
          required: true,
        })
      )
      return
    }

    dayRows.forEach((row) => {
      const timeline = timelines.get(row.id)
      if (!timeline || untouched.has(row.id)) return
      const size = sizeAt(timeline, row.created_at.slice(0, 16))
      if (Math.abs(size - row.size) > 1e-6) {
        updates.push({
          rowid: row.rowid,
          size,
          price: row.price,
          ratio: row.ratio,
          date,
        })
      }
    })
    const present = new Set(dayRows.map((row) => row.id))
    const lastCreated = dayRows[dayRows.length - 1].created_at
    held
      .filter((p) => !present.has(p.id) && !untouched.has(p.id))
      .forEach((p) =>
        inserts.push({
          id: p.id,
          size: p.size,
          date,
          createdAt: lastCreated,
          required: false,
        })
      )
  })

  return { start, end, inserts, updates, inconsistent }
}

// Consecutive days merged into [{ from, to }]
exports.dayRanges = (days) => {
  const ranges = []
  ;[...new Set(days)].sort().forEach((day) => {
    const last = ranges[ranges.length - 1]
    if (last && exports.addDays(last.to, 1) === day) last.to = day
    else ranges.push({ from: day, to: day })
  })
  return ranges
}

// Price on a date interpolated between known prices ([{ date, price }],
// oldest first); carried forward/back outside of them.
exports.estimateOn = (anchors, date) => {
  let before = null
  let after = null
  for (const anchor of anchors) {
    if (anchor.date <= date) before = anchor
    else if (after === null) after = anchor
  }
  if (!before || !after) return (before ?? after)?.price ?? null
  if (before.date === date) return before.price
  const span = Date.parse(after.date) - Date.parse(before.date)
  const part = (Date.parse(date) - Date.parse(before.date)) / span
  return before.price + (after.price - before.price) * part
}

const round = (value) => Math.round(value * 100) / 100

// Last stored price of a position before a date: { date, price } or null
const lastKnownPrice = async (db, id, date) => {
  const rows = await storage.call(
    db,
    "select strftime('%Y-%m-%d', created_at) as date, price " +
      `from ${storage.STOCKS_TABLE} where id = ? and created_at < ? ` +
      'and price > 0 order by created_at desc limit 1',
    [id, date]
  )
  return rows[0] ?? null
}

// Known prices of a position without Yahoo history: its stocks rows (last of
// each day) and the prices of its CSV transactions.
const knownPrices = async (db, position) => {
  const rows = await storage.call(
    db,
    'select date, price from (' +
      "select strftime('%Y-%m-%d', created_at) as date, price, " +
      'row_number() over (partition by date(created_at) ' +
      'order by created_at desc, rowid desc) as n ' +
      `from ${storage.STOCKS_TABLE} where id = ? and price > 0) ` +
      'where n = 1 ' +
      'union all ' +
      'select substr(datetime, 1, 10) as date, price ' +
      `from ${storage.TRANSACTIONS_TABLE} where position_id = ? ` +
      "and source = 'degiro_csv' and price > 0 and currency = ? " +
      'order by date',
    [position.id, position.id, position.currency]
  )
  const byDate = new Map()
  rows.forEach((row) => byDate.set(row.date, row.price))
  return [...byDate.entries()].map(([date, price]) => ({ date, price }))
}

// Prices for the planned inserts: Yahoo history per symbol, FX to CZK from
// Yahoo's <CUR>CZK=X pairs. Without Yahoo history the price is estimated from
// known prices. Returns { rows, problems, skipped, estimated }.
exports.price = async (db, prices, inserts) => {
  const positions = await storage.call(
    db,
    `select * from ${storage.POSITIONS_TABLE}`
  )
  const byId = new Map(positions.map((p) => [p.id, p]))
  // sold positions no longer in positions: name and currency of their last
  // stocks row, priced from their known prices
  const orphans = [...new Set(inserts.map((ins) => ins.id))].filter(
    (id) => !byId.has(id)
  )
  for (const id of orphans) {
    const last = await storage.call(
      db,
      `select name, currency from ${storage.STOCKS_TABLE} where id = ? ` +
        'order by created_at desc limit 1',
      [id]
    )
    if (last[0]) byId.set(id, { id, symbol: '', ...last[0] })
  }
  const first = new Map() // id -> first date needed
  inserts.forEach((ins) => {
    if (!first.has(ins.id) || ins.date < first.get(ins.id)) {
      first.set(ins.id, ins.date)
    }
  })
  if (first.size === 0) {
    return { rows: [], problems: [], skipped: [], estimated: [] }
  }
  const firstDate = [...first.values()].reduce((a, b) => (a < b ? a : b))

  const histories = new Map() // id -> closes
  const anchors = new Map() // id -> known prices, when Yahoo has none
  const estimated = []
  for (const [id, date] of first) {
    const position = byId.get(id)
    if (!position) continue
    let reason = null
    if (!(position.symbol ?? '').trim()) {
      reason = 'no Yahoo symbol'
    } else {
      try {
        const known = await lastKnownPrice(db, id, date)
        // from a week before the last stored price (or the first day), so
        // they can be compared and the first day can carry the previous close
        const since = known && known.date < date ? known.date : date
        const history = await prices.getHistory(
          position.symbol,
          exports.addDays(since, -7)
        )
        if (history.currency !== position.currency) {
          throw new Error(
            `currency ${history.currency}, expected ${position.currency}`
          )
        }
        // history starting later belongs to another listing (e.g. after a
        // restructuring), it is not used at all
        if (exports.closeOn(history.closes, date) === null) {
          throw new Error(`no price history on ${date}`)
        }
        // Yahoo must agree with the last stored price, otherwise a split or
        // other units make it incomparable with the stored sizes
        if (known) {
          const close = exports.closeOn(history.closes, known.date)
          if (close !== null && Math.abs(close / known.price - 1) > 0.3) {
            throw new Error(
              `close ${round(close)} differs from stored ${round(
                known.price
              )} on ${known.date}`
            )
          }
        }
        histories.set(id, history.closes)
      } catch (e) {
        reason = `${position.symbol}: ${e.message}`
      }
    }
    if (reason) {
      const known = await knownPrices(db, position)
      if (known.length > 0) {
        anchors.set(id, known)
        estimated.push({ id, name: position.name, reason, days: 0 })
      }
    }
  }

  const fx = new Map()
  const currencies = new Set(
    [...first.keys()]
      .map((id) => byId.get(id)?.currency)
      .filter((currency) => currency && currency !== 'CZK')
  )
  for (const currency of currencies) {
    try {
      const history = await prices.getHistory(
        `${currency}CZK=X`,
        exports.addDays(firstDate, -7)
      )
      fx.set(currency, history.closes)
    } catch (e) {
      throw new Error(`No ${currency}/CZK rates: ${e.message}`)
    }
  }

  const rows = []
  const problems = []
  const skipped = []
  inserts.forEach((ins) => {
    const position = byId.get(ins.id)
    let price = null
    let problem = null
    if (!position) {
      problem = 'not in positions'
    } else if (histories.has(ins.id)) {
      price = exports.closeOn(histories.get(ins.id), ins.date)
      if (price === null) problem = `${position.symbol}: no price yet`
    } else if (anchors.has(ins.id)) {
      price = exports.estimateOn(anchors.get(ins.id), ins.date)
      estimated.find((e) => e.id === ins.id).days++
    } else {
      problem = `${position.name}: no Yahoo price nor any known price`
    }
    const currency = position?.currency
    const ratio =
      currency === 'CZK'
        ? 1
        : fx.has(currency)
        ? exports.closeOn(fx.get(currency), ins.date)
        : null
    if (!problem && ratio === null) problem = `${currency}/CZK: no rate yet`
    if (problem) {
      ;(ins.required ? problems : skipped).push({
        id: ins.id,
        date: ins.date,
        problem,
      })
      return
    }
    rows.push({
      id: ins.id,
      price,
      size: ins.size,
      value: price * ins.size * ratio,
      name: position.name,
      currency,
      ratio,
      created_at: ins.createdAt,
    })
  })
  return { rows, problems, skipped, estimated }
}

// "id: problem (first..last date, n days)" per id and problem
exports.summarize = (problems) => {
  const groups = new Map()
  problems.forEach(({ id, date, problem }) => {
    const key = `${id}: ${problem}`
    const group = groups.get(key) ?? { first: date, last: date, days: 0 }
    group.first = date < group.first ? date : group.first
    group.last = date > group.last ? date : group.last
    group.days++
    groups.set(key, group)
  })
  return [...groups.entries()].map(
    ([key, g]) => `${key} (${g.first}..${g.last}, ${g.days} days)`
  )
}

// Makes `stocks` match the transactions (see plan), nothing is written when a
// day without any import can't be priced completely.
exports.backfillStocks = async (db, prices, options = {}) => {
  const plan = await exports.plan(db, options)
  const inconsistent = plan?.inconsistent ?? []
  inconsistent.forEach((p) =>
    logger.error(
      `${p.name} (${p.id}) has size ${p.positions} in positions but ` +
        `${p.transactions} by transactions, its imported rows are not corrected`
    )
  )
  if (!plan || (plan.inserts.length === 0 && plan.updates.length === 0)) {
    return {
      inconsistent,
      inserted: 0,
      corrected: 0,
      skipped: [],
      estimated: [],
      changed: [],
    }
  }

  const { rows, problems, skipped, estimated } = await exports.price(
    db,
    prices,
    plan.inserts
  )
  if (problems.length > 0) {
    throw new Error(
      `Cannot price ${problems.length} rows, nothing was changed: ` +
        exports.summarize(problems).join('; ')
    )
  }
  const skippedSummary = exports.summarize(skipped)
  skippedSummary.forEach((line) => logger.error(`Backfill skipped ${line}`))
  estimated.forEach((e) =>
    logger.error(
      `Backfill estimated ${e.days} prices of ${e.name}: ${e.reason}`
    )
  )

  await storage.run(db, 'BEGIN')
  try {
    for (const row of rows) {
      await storage.run(
        db,
        `insert into ${storage.STOCKS_TABLE} (id, price, size, value, name, ` +
          'currency, ratio, created_at) values (?,?,?,?,?,?,?,?)',
        [
          row.id,
          row.price,
          row.size,
          row.value,
          row.name,
          row.currency,
          row.ratio,
          row.created_at,
        ]
      )
    }
    for (const { rowid, size, price, ratio } of plan.updates) {
      const value =
        price === null || ratio === null ? null : price * size * ratio
      await storage.run(
        db,
        `update ${storage.STOCKS_TABLE} set size=?, value=? where rowid=?`,
        [size, value, rowid]
      )
    }
    await storage.run(db, 'COMMIT')
  } catch (e) {
    await storage.run(db, 'ROLLBACK')
    throw e
  }

  return {
    inserted: rows.length,
    corrected: plan.updates.length,
    skipped: skippedSummary,
    inconsistent,
    estimated,
    changed: exports.dayRanges([
      ...rows.map((row) => row.created_at.slice(0, 10)),
      ...plan.updates.map((update) => update.date),
    ]),
  }
}

// PUT /fill-daily: stocks are made to match the transactions first, then the
// events are rebuilt and stocks_by_daily is recomputed for the changed days
// and the days since its last row.
exports.fillDaily = async (db, prices, options = {}) => {
  const backfill = await exports.backfillStocks(db, prices, options)
  if (backfill.changed.length > 0) {
    await data.computeAndStoreOrdersData(db)
  }
  const missing = await sd.getMissingDates(db)
  const ranges = [
    ...backfill.changed.filter((range) => range.to < missing.fromDate),
    {
      from: backfill.changed
        .filter((range) => range.to >= missing.fromDate)
        .reduce(
          (min, range) => (range.from < min ? range.from : min),
          missing.fromDate
        ),
      to: missing.toDate,
    },
  ]
  for (const range of ranges) {
    await sd.updateMissing(db, { fromDate: range.from, toDate: range.to })
  }
  return { ...backfill, recomputed: ranges }
}
