const crypto = require('crypto')
const storage = require('./storage.js')
const { KNOWN_POSITIONS } = require('./known_positions.js')

// Column order of the DEGIRO "Transactions" CSV export (Czech and English
// headers differ, the layout does not).
const COL = {
  date: 0,
  time: 1,
  product: 2,
  isin: 3,
  venue: 5,
  size: 6,
  price: 7,
  currency: 8,
  valueEur: 11,
  fxRate: 12,
  autoFxFee: 13,
  feeEur: 14,
  totalEur: 15,
  orderId: 16,
}
const MIN_COLUMNS = 17

exports.SOURCE_CSV = 'degiro_csv'
exports.SOURCE_DAILY = 'stocks_by_daily'
exports.NEW_POSITION = '__new__'
exports.SKIP_POSITION = '__skip__'

exports.parseCsvLines = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''))
}

// "1 234,56" / "-0,85" / "" -> number or null
exports.parseNumber = (value) => {
  let str = String(value ?? '').replace(/[\s ]/g, '')
  if (str === '') return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  const number = Number(str)
  if (!Number.isFinite(number)) throw new Error(`Not a number: "${value}"`)
  return number
}

// "21-10-2026", "10:34" -> "2026-10-21 10:34"
exports.parseDateTime = (date, time) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date.trim())
  if (!match || !/^\d{2}:\d{2}$/.test(time.trim())) {
    throw new Error(`Unexpected date/time: "${date} ${time}"`)
  }
  return `${match[3]}-${match[2]}-${match[1]} ${time.trim()}`
}

// occurrence: 1 for the first row with these values, 2 for an identical
// second one (e.g. two equal partial fills of one order in the same minute)
exports.transactionKey = (trn, occurrence = 1) =>
  crypto
    .createHash('sha1')
    .update(
      [
        trn.orderId,
        trn.datetime,
        trn.isin,
        trn.size,
        trn.price,
        ...(occurrence > 1 ? [occurrence] : []),
      ].join('|')
    )
    .digest('hex')

// Parsed transactions, oldest first.
exports.parseTransactions = (text) => {
  const rows = exports.parseCsvLines(String(text ?? ''))
  if (rows.length === 0) throw new Error('The CSV is empty')
  const [header, ...body] = rows
  if (header.length < MIN_COLUMNS || header[COL.isin].trim() !== 'ISIN') {
    throw new Error('This does not look like a DEGIRO Transactions CSV export')
  }

  const transactions = []
  body.forEach((row, index) => {
    const line = index + 2
    // DEGIRO wraps long product names onto a row of their own.
    if (row[COL.date].trim() === '' && row[COL.time].trim() === '') {
      const last = transactions[transactions.length - 1]
      if (!last) throw new Error(`Line ${line}: continuation without a row`)
      last.product = `${last.product} ${row[COL.product].trim()}`.trim()
      return
    }
    if (row.length < MIN_COLUMNS) {
      throw new Error(`Line ${line}: expected ${MIN_COLUMNS} columns`)
    }
    try {
      const trn = {
        datetime: exports.parseDateTime(row[COL.date], row[COL.time]),
        product: row[COL.product].trim(),
        isin: row[COL.isin].trim(),
        venue: row[COL.venue].trim() || null,
        size: exports.parseNumber(row[COL.size]),
        price: exports.parseNumber(row[COL.price]),
        currency: row[COL.currency].trim(),
        valueEur: exports.parseNumber(row[COL.valueEur]),
        fxRate: exports.parseNumber(row[COL.fxRate]),
        feeEur:
          (exports.parseNumber(row[COL.autoFxFee]) ?? 0) +
          (exports.parseNumber(row[COL.feeEur]) ?? 0),
        totalEur: exports.parseNumber(row[COL.totalEur]),
        orderId: row[COL.orderId].trim() || null,
      }
      if (!trn.isin) throw new Error('ISIN is missing')
      if (trn.size === null) throw new Error('quantity is missing')
      transactions.push(trn)
    } catch (e) {
      throw new Error(`Line ${line}: ${e.message}`)
    }
  })

  // identical rows get distinct keys, numbered the same way in every export
  const seen = new Map()
  transactions.forEach((trn) => {
    const base = exports.transactionKey(trn)
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    trn.key = exports.transactionKey(trn, occurrence)
  })
  return transactions.sort((a, b) => a.datetime.localeCompare(b.datetime))
}

exports.insertTransaction = (db, trn) =>
  storage.run(
    db,
    `insert into ${storage.TRANSACTIONS_TABLE} (key, datetime, product, ` +
      'isin, venue, size, price, currency, value_eur, fx_rate, fee_eur, ' +
      'total_eur, order_id, position_id, applied, source, ingested_at) ' +
      "values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, DATETIME('now'))",
    [
      trn.key,
      trn.datetime,
      trn.product,
      trn.isin ?? null,
      trn.venue ?? null,
      trn.size,
      trn.price ?? null,
      trn.currency ?? null,
      trn.valueEur ?? null,
      trn.fxRate ?? null,
      trn.feeEur ?? null,
      trn.totalEur ?? null,
      trn.orderId ?? null,
      trn.positionId ?? null,
      trn.applied ? 1 : 0,
      trn.source,
    ]
  )

exports.getLastIngested = async (db) => {
  const rows = await storage.call(
    db,
    `select * from ${storage.TRANSACTIONS_TABLE} ` +
      'order by datetime desc, ingested_at desc limit 1'
  )
  return rows[0] ?? null
}

// Everything after the last ingested transaction. Rows from the same minute
// as the last one are kept unless they are already stored.
exports.selectNewTransactions = async (db, transactions) => {
  const last = await exports.getLastIngested(db)
  if (!last) return { last, fresh: transactions, older: 0 }

  const sameMinute = await storage.call(
    db,
    `select key from ${storage.TRANSACTIONS_TABLE} where datetime = ?`,
    [last.datetime]
  )
  const known = new Set(sameMinute.map((row) => row.key))
  const fresh = transactions.filter(
    (trn) =>
      trn.datetime > last.datetime ||
      (trn.datetime === last.datetime && !known.has(trn.key))
  )
  return { last, fresh, older: transactions.length - fresh.length }
}

const words = (name) =>
  new Set(
    String(name ?? '')
      .toLowerCase()
      .split(/[^a-z0-9&]+/)
      .filter((word) => word.length > 1)
  )

// Position whose name shares the most words with the product name.
exports.suggestPosition = (product, positions) => {
  // old lines of a corporate action, they belong to no position
  if (/non tradeable/i.test(product)) return null
  const productWords = words(product)
  let best = null
  let bestScore = 0
  positions.forEach((position) => {
    if (position.isin) return
    const positionWords = words(position.name)
    let score = 0
    positionWords.forEach((word) => productWords.has(word) && score++)
    if (score > bestScore) {
      best = position
      bestScore = score
    }
  })
  return best
}

exports.getPositions = (db) =>
  storage.call(db, `select * from ${storage.POSITIONS_TABLE} order by name`)

// Position of an ISIN from KNOWN_POSITIONS: { position, link } when that
// position exists (link = its ISIN still has to be stored), { create } when it
// doesn't, null when unknown or the position belongs to another ISIN.
exports.knownTarget = (trn, byId, known) => {
  const entry = Object.entries(known).find(([, k]) => k.isin === trn.isin)
  if (!entry) return null
  const [id, { symbol }] = entry
  const knownSymbol = symbol ?? null
  const position = byId.get(id)
  if (position) {
    if (position.isin && position.isin !== trn.isin) return null
    return { position, link: !position.isin, symbol: knownSymbol }
  }
  return {
    create: {
      id,
      symbol: symbol ?? '',
      name: trn.product,
      currency: trn.currency,
      size: 0,
      isin: trn.isin,
    },
  }
}

exports.preview = async (db, csv, known = KNOWN_POSITIONS) => {
  const transactions = exports.parseTransactions(csv)
  const { last, fresh, older } = await exports.selectNewTransactions(
    db,
    transactions
  )
  const positions = await exports.getPositions(db)
  const byId = new Map(positions.map((p) => [p.id, p]))
  const byIsin = new Map(
    positions.filter((p) => p.isin).map((p) => [p.isin, p])
  )

  const isins = []
  fresh.forEach((trn) => {
    if (isins.some((item) => item.isin === trn.isin)) return
    const viaKnown = byIsin.has(trn.isin)
      ? null
      : exports.knownTarget(trn, byId, known)
    const matched = byIsin.get(trn.isin) ?? viaKnown?.position ?? null
    const knownNew = viaKnown?.create ?? null
    isins.push({
      isin: trn.isin,
      product: trn.product,
      currency: trn.currency,
      matched,
      knownNew,
      suggested:
        matched || knownNew
          ? null
          : exports.suggestPosition(trn.product, positions),
    })
  })

  return { last, fresh, older, total: transactions.length, isins, positions }
}

// mapping: { [isin]: positionId | NEW_POSITION | SKIP_POSITION }
// symbols: { [isin]: yahoo symbol } for NEW_POSITION
// apply: keys of the transactions that change position sizes
exports.ingest = async (
  db,
  csv,
  { mapping = {}, symbols = {}, apply = [], known = KNOWN_POSITIONS }
) => {
  const { fresh } = await exports.preview(db, csv, known)
  if (fresh.length === 0) return { inserted: 0, changes: [] }

  const positions = await exports.getPositions(db)
  const byId = new Map(positions.map((p) => [p.id, p]))
  const byIsin = new Map(
    positions.filter((p) => p.isin).map((p) => [p.isin, p])
  )
  const applyKeys = new Set(apply)

  // isin -> position id (null = only record the transaction)
  const target = new Map()
  const newPositions = []
  const isinUpdates = []
  for (const trn of fresh) {
    if (target.has(trn.isin)) continue
    const matched = byIsin.get(trn.isin)
    const viaKnown = matched ? null : exports.knownTarget(trn, byId, known)
    const linkTaken = (id) => isinUpdates.some((u) => u.id === id)
    const choice = mapping[trn.isin]
    if (matched) {
      target.set(trn.isin, matched.id)
    } else if (viaKnown?.position && !linkTaken(viaKnown.position.id)) {
      if (viaKnown.link) {
        isinUpdates.push({
          id: viaKnown.position.id,
          isin: trn.isin,
          symbol: viaKnown.symbol,
        })
      }
      target.set(trn.isin, viaKnown.position.id)
    } else if (viaKnown?.create) {
      newPositions.push(viaKnown.create)
      target.set(trn.isin, viaKnown.create.id)
    } else if (choice === exports.SKIP_POSITION) {
      target.set(trn.isin, null)
    } else if (choice === exports.NEW_POSITION) {
      const symbol = String(symbols[trn.isin] ?? '').trim()
      if (!symbol) throw new Error(`Yahoo symbol missing for ${trn.isin}`)
      if (byId.has(trn.isin)) {
        throw new Error(`Position with id ${trn.isin} already exists`)
      }
      newPositions.push({
        id: trn.isin,
        symbol,
        name: trn.product,
        currency: trn.currency,
        size: 0,
        isin: trn.isin,
      })
      target.set(trn.isin, trn.isin)
    } else if (byId.has(choice)) {
      const position = byId.get(choice)
      const taken =
        position.isin ?? isinUpdates.find((u) => u.id === choice)?.isin
      if (taken && taken !== trn.isin) {
        throw new Error(`${position.name} already belongs to ${taken}`)
      }
      isinUpdates.push({ id: choice, isin: trn.isin })
      target.set(trn.isin, choice)
    } else {
      throw new Error(`Choose a position for ${trn.isin} (${trn.product})`)
    }
  }

  const sizes = new Map(positions.map((p) => [p.id, p.size]))
  newPositions.forEach((p) => sizes.set(p.id, 0))
  const before = new Map(sizes)
  const records = fresh.map((trn) => {
    const positionId = target.get(trn.isin)
    const applied = positionId !== null && applyKeys.has(trn.key)
    if (applied) sizes.set(positionId, sizes.get(positionId) + trn.size)
    return { trn, positionId, applied }
  })

  const changes = [...sizes.keys()]
    .filter((id) => sizes.get(id) !== before.get(id) || !byId.has(id))
    .map((id) => ({
      id,
      name: byId.get(id)?.name ?? newPositions.find((p) => p.id === id).name,
      from: before.get(id),
      to: sizes.get(id),
    }))
  const negative = changes.find((change) => change.to < 0)
  if (negative) {
    throw new Error(
      `${negative.name} would end with ${negative.to} shares, nothing was ingested`
    )
  }

  await storage.run(db, 'BEGIN')
  try {
    for (const position of newPositions) {
      await storage.upsertPosition(db, position)
    }
    for (const { id, isin, symbol } of isinUpdates) {
      // a known Yahoo symbol fills an empty one, never replaces it
      await storage.run(
        db,
        `update ${storage.POSITIONS_TABLE} set isin=?, symbol=case ` +
          "when trim(symbol)='' then coalesce(?, symbol) else symbol end " +
          'where id=?',
        [isin, symbol ?? null, id]
      )
    }
    for (const { trn, positionId, applied } of records) {
      await exports.insertTransaction(db, {
        ...trn,
        positionId,
        applied,
        source: exports.SOURCE_CSV,
      })
    }
    for (const change of changes) {
      await storage.run(
        db,
        `update ${storage.POSITIONS_TABLE} set size=?, ` +
          "updated_at=DATETIME('now') where id=?",
        [change.to, change.id]
      )
    }
    await storage.run(db, 'COMMIT')
  } catch (e) {
    await storage.run(db, 'ROLLBACK')
    throw e
  }

  return { inserted: records.length, changes }
}

const formatNumber = (value) =>
  value === null || value === undefined
    ? ''
    : value.toLocaleString('cs-CZ', { maximumFractionDigits: 4 })

const positionLabel = (p) => `${p.name} (${p.symbol}, ${p.size})`

// Data for views/ingest.html
exports.previewView = (preview, csv) => {
  const { last, fresh, older, total, isins, positions } = preview
  return {
    last,
    csv,
    preview: true,
    total,
    older,
    freshCount: fresh.length,
    hasFresh: fresh.length > 0,
    hasIsins: isins.length > 0,
    newPosition: exports.NEW_POSITION,
    fresh: fresh.map((trn) => ({
      ...trn,
      date: trn.datetime.slice(0, 10),
      size: trn.size > 0 ? `+${trn.size}` : `${trn.size}`,
      price: formatNumber(trn.price),
      totalEur: formatNumber(trn.totalEur),
    })),
    isins: isins.map((item) => ({
      ...item,
      matchedName: item.matched
        ? positionLabel(item.matched)
        : item.knownNew
        ? `new position ${item.knownNew.symbol || 'without Yahoo symbol'}`
        : null,
      options: [
        ...positions
          .filter((p) => !p.isin)
          .map((p) => ({
            value: p.id,
            label: positionLabel(p),
            selected: item.suggested?.id === p.id,
          })),
        { value: exports.NEW_POSITION, label: 'New position…' },
        { value: exports.SKIP_POSITION, label: 'Ignore (record only)' },
      ],
    })),
  }
}

// Form body of POST /ingest -> options of exports.ingest
exports.parseIngestForm = (body = {}) => ({
  mapping: body.map ?? {},
  symbols: body.symbol ?? {},
  apply: String(body.apply_keys ?? '')
    .split(',')
    .filter((key) => key !== ''),
})

// Initial population: every size change in stocks_by_daily becomes a
// transaction and positions get the latest known sizes. Dated at the end of
// the day, as a daily row holds the size after that day's trades, so CSV
// transactions of that day count as already ingested.
exports.populateFromDaily = async (db, known = KNOWN_POSITIONS) => {
  const existing = await storage.call(
    db,
    `select count(*) as count from ${storage.TRANSACTIONS_TABLE} ` +
      'where source != ?',
    [exports.SOURCE_DAILY]
  )
  if (existing[0].count > 0) {
    throw new Error(
      'CSV transactions are already ingested, populating from history ' +
        'would mix with them'
    )
  }

  const rows = await storage.call(
    db,
    'select id, name, currency, date, size, price ' +
      `from ${storage.STOCKS_DAILY_TABLE} where size is not null ` +
      'order by id, date'
  )

  const transactions = []
  const latest = new Map()
  rows.forEach((row) => {
    const previous = latest.get(row.id)
    const delta = row.size - (previous?.size ?? 0)
    if (delta !== 0) {
      transactions.push({
        key: `${exports.SOURCE_DAILY}|${row.id}|${row.date}`,
        datetime: `${row.date} 23:59`,
        product: row.name,
        size: delta,
        price: row.price,
        currency: row.currency,
        positionId: String(row.id),
        applied: true,
        source: exports.SOURCE_DAILY,
      })
    }
    latest.set(row.id, row)
  })

  const positions = await exports.getPositions(db)
  const byId = new Map(positions.map((p) => [p.id, p]))
  const usedIsins = new Set(positions.map((p) => p.isin).filter(Boolean))
  // ISIN from KNOWN_POSITIONS unless another position already has it
  const knownIsin = (id) => {
    const isin = known[id]?.isin
    if (!isin || usedIsins.has(isin)) return null
    usedIsins.add(isin)
    return isin
  }
  const changes = []
  // still held but without a position; symbol and ISIN from KNOWN_POSITIONS
  const created = []
  latest.forEach((row, rowId) => {
    const id = String(rowId)
    const position = byId.get(id)
    if (!position) {
      if (row.size > 0) {
        created.push({
          id,
          symbol: known[id]?.symbol ?? '',
          name: row.name,
          currency: row.currency,
          size: row.size,
          isin: knownIsin(id),
        })
      }
    } else if (position.size !== row.size) {
      changes.push({
        id,
        name: position.name,
        from: position.size,
        to: row.size,
      })
    }
  })

  // existing positions: fill in a missing symbol or ISIN, never overwrite
  const filled = []
  positions.forEach((position) => {
    const symbol =
      (position.symbol ?? '').trim() === '' ? known[position.id]?.symbol : null
    const isin = position.isin ? null : knownIsin(position.id)
    if (symbol || isin) {
      filled.push({
        id: position.id,
        symbol: symbol || position.symbol,
        isin: isin || position.isin,
      })
    }
  })

  await storage.run(db, 'BEGIN')
  try {
    for (const { id, symbol, isin } of filled) {
      await storage.run(
        db,
        `update ${storage.POSITIONS_TABLE} set symbol=?, isin=?, ` +
          "updated_at=DATETIME('now') where id=?",
        [symbol, isin, id]
      )
    }
    // re-running replaces what an earlier run derived
    await storage.run(
      db,
      `delete from ${storage.TRANSACTIONS_TABLE} where source = ?`,
      [exports.SOURCE_DAILY]
    )
    for (const trn of transactions) {
      await exports.insertTransaction(db, trn)
    }
    for (const position of created) {
      await storage.upsertPosition(db, position)
    }
    for (const change of changes) {
      await storage.run(
        db,
        `update ${storage.POSITIONS_TABLE} set size=?, ` +
          "updated_at=DATETIME('now') where id=?",
        [change.to, change.id]
      )
    }
    await storage.run(db, 'COMMIT')
  } catch (e) {
    await storage.run(db, 'ROLLBACK')
    throw e
  }

  const last = transactions.reduce(
    (max, trn) => (trn.datetime > max ? trn.datetime : max),
    ''
  )
  return {
    inserted: transactions.length,
    last: last || null,
    changes,
    created,
    filled,
  }
}

// Shared data of every views/ingest.html render.
exports.pageState = async (db) => {
  const last = await exports.getLastIngested(db)
  const csvRows = await storage.call(
    db,
    `select count(*) as count from ${storage.TRANSACTIONS_TABLE} ` +
      'where source != ?',
    [exports.SOURCE_DAILY]
  )
  const withoutSymbol = await storage.call(
    db,
    `select * from ${storage.POSITIONS_TABLE} ` +
      "where size > 0 and trim(symbol) = '' order by name"
  )
  return {
    last,
    canPopulate: csvRows[0].count === 0,
    populated: last !== null,
    withoutSymbol,
    hasWithoutSymbol: withoutSymbol.length > 0,
  }
}

// Form body of POST /ingest/symbols -> { [positionId]: yahoo symbol }. Fields
// are named position_symbol[p<id>]: a bare numeric id up to 20 would be parsed
// as an array index and lose the id.
exports.parseSymbolsForm = (body = {}) => {
  const fields = body.position_symbol
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {}
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key.startsWith('p'))
      .map(([key, value]) => [key.slice(1), value])
  )
}

// symbols: { [positionId]: yahoo symbol }, empty values are left alone
exports.setSymbols = async (db, symbols = {}) => {
  let updated = 0
  for (const [id, value] of Object.entries(symbols)) {
    const symbol = String(value ?? '').trim()
    if (symbol === '') continue
    await storage.run(
      db,
      `update ${storage.POSITIONS_TABLE} set symbol=?, ` +
        "updated_at=DATETIME('now') where id=?",
      [symbol, id]
    )
    updated++
  }
  return updated
}
