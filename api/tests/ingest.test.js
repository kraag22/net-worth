const ingest = require('../src/ingest.js')
const storage = require('../src/storage.js')

const HEADER =
  'Datum,Čas,Produkt,ISIN,Reference exchange,Venue,Počet,Cena,,' +
  'Hodnota v domácí měně,,Hodnota EUR,Směnný kurz,AutoFX Fee,' +
  'Transaction and/or third party fees EUR,Celkem EUR,ID objednávky'

const csv = (...rows) => [HEADER, ...rows].join('\n') + '\n'

const KO_1 =
  '01-06-2026,15:30,COCA-COLA CO,US1912161007,NSY,XNYS,5,"78,6800",USD,' +
  '"-393,40",USD,"-338,32","1,1628","-0,85","-2,00","-341,17",order-ko-1'
const ETF_1 =
  '18-11-2025,14:30,ISHARES STOXX GLOBAL SELECT DIVIDEND 100 UCITS,' +
  'DE000A0F5UH1,TDG,XGAT,10,"32,5200",EUR,"-325,20",EUR,"-325,20",' +
  '"0,0000","0,00","-1,00","-326,20",order-etf-1\n,,(DE) ETF,,,,,,,,,,,,,,'
const ETF_2 =
  '21-10-2026,10:34,ISHARES STOXX GLOBAL SELECT DIVIDEND 100 UCITS (DE) ETF,' +
  'DE000A0F5UH1,TDG,XGAT,18,"39,8400",EUR,"-717,12",EUR,"-717,12",' +
  '"0,0000","0,00","-1,00","-718,12",order-etf-2'
const WBD_OUT =
  '07-10-2026,10:46,"WARNER BROS. DISCOVERY, INC.",US9344231041,NDQ,,-19,' +
  '"0,0000",USD,"0,00",USD,"0,00","1,1197","0,00",,"0,00",'

let db = null

const addPosition = (id, symbol, name, currency, size, isin) =>
  storage.upsertPosition(db, { id, symbol, name, currency, size, isin })

const positionSize = async (id) =>
  (await storage.call(db, 'select size from positions where id=?', [id]))[0]
    ?.size

beforeEach(async () => {
  db = await storage.connectDb(':memory:')
  await addPosition('331829', 'KO', 'Coca-Cola', 'USD', 12)
  await addPosition(
    '19747492',
    'ISPA.DE',
    'iShares STOXX Global Select Dividend 100 (DE)',
    'EUR',
    59
  )
  await addPosition(
    '883053',
    'EXI2.DE',
    'iShares Dow Jones Global Titans 50',
    'EUR',
    2
  )
  await addPosition('22187048', 'WBD', 'Warner Bros Discovery Inc', 'USD', 19)
})

afterEach((done) => {
  db.close(done)
})

describe('parseTransactions', () => {
  it('parses rows oldest first and joins wrapped product names', () => {
    const trns = ingest.parseTransactions(csv(ETF_2, KO_1, ETF_1))
    expect(trns.map((t) => t.datetime)).toEqual([
      '2025-11-18 14:30',
      '2026-06-01 15:30',
      '2026-10-21 10:34',
    ])
    expect(trns[0].product).toBe(
      'ISHARES STOXX GLOBAL SELECT DIVIDEND 100 UCITS (DE) ETF'
    )
    expect(trns[1]).toMatchObject({
      isin: 'US1912161007',
      size: 5,
      price: 78.68,
      currency: 'USD',
      valueEur: -338.32,
      feeEur: -2.85,
      totalEur: -341.17,
      orderId: 'order-ko-1',
    })
  })

  it('keeps corporate actions without an order id', () => {
    const [trn] = ingest.parseTransactions(csv(WBD_OUT))
    expect(trn).toMatchObject({
      product: 'WARNER BROS. DISCOVERY, INC.',
      size: -19,
      orderId: null,
      feeEur: 0,
    })
  })

  it('rejects other files', () => {
    expect(() => ingest.parseTransactions('a,b,c\n1,2,3')).toThrow(
      'DEGIRO Transactions CSV'
    )
    expect(() => ingest.parseTransactions('')).toThrow('empty')
  })

  it('reports the line of a broken row', () => {
    expect(() =>
      ingest.parseTransactions(csv(KO_1.replace('01-06-2026', '2026/06/01')))
    ).toThrow('Line 2')
  })

  it('parses numbers with thousands separators', () => {
    expect(ingest.parseNumber('-1 234,56')).toBe(-1234.56)
    expect(ingest.parseNumber('1.234,5')).toBe(1234.5)
    expect(ingest.parseNumber('')).toBeNull()
  })
})

describe('preview', () => {
  it('suggests positions by name for unknown ISINs', async () => {
    const preview = await ingest.preview(db, csv(ETF_1, KO_1), {})
    expect(preview.last).toBeNull()
    expect(preview.fresh).toHaveLength(2)
    const byIsin = Object.fromEntries(preview.isins.map((i) => [i.isin, i]))
    expect(byIsin.DE000A0F5UH1.suggested.id).toBe('19747492')
    expect(byIsin.US1912161007.suggested.id).toBe('331829')
  })

  it('builds the view with the suggestion selected', async () => {
    const preview = await ingest.preview(db, csv(KO_1), {})
    const view = ingest.previewView(preview, 'x')
    const selected = view.isins[0].options.filter((o) => o.selected)
    expect(selected.map((o) => o.value)).toEqual(['331829'])
    expect(view.fresh[0].size).toBe('+5')
  })
})

describe('ingest', () => {
  const mapping = {
    DE000A0F5UH1: '19747492',
    US1912161007: '331829',
    US9344231041: '22187048',
  }
  const all = (text) => ingest.parseTransactions(text).map((t) => t.key)

  it('stores transactions, links ISINs and updates sizes', async () => {
    const text = csv(ETF_2, WBD_OUT, KO_1, ETF_1)
    const result = await ingest.ingest(db, text, {
      known: {},
      mapping,
      apply: all(text),
    })

    expect(result.inserted).toBe(4)
    expect(await positionSize('19747492')).toBe(59 + 10 + 18)
    expect(await positionSize('331829')).toBe(17)
    expect(await positionSize('22187048')).toBe(0)
    const isins = await storage.call(
      db,
      'select id, isin from positions where isin is not null order by id'
    )
    expect(isins).toHaveLength(3)
    expect((await ingest.getLastIngested(db)).datetime).toBe('2026-10-21 10:34')
  })

  it('ingests only transactions after the last ingested one', async () => {
    const first = csv(KO_1, ETF_1)
    await ingest.ingest(db, first, { known: {}, mapping, apply: all(first) })

    const second = csv(ETF_2, KO_1, ETF_1)
    const preview = await ingest.preview(db, second, {})
    expect(preview.fresh.map((t) => t.orderId)).toEqual(['order-etf-2'])
    expect(preview.older).toBe(2)
    // ISINs are matched now, no mapping needed
    expect(preview.isins[0].matched.id).toBe('19747492')

    const result = await ingest.ingest(db, second, {
      known: {},
      apply: all(second),
    })
    expect(result.inserted).toBe(1)
    expect(await positionSize('19747492')).toBe(59 + 10 + 18)

    const again = await ingest.ingest(db, second, {
      known: {},
      apply: all(second),
    })
    expect(again.inserted).toBe(0)
    expect(await positionSize('19747492')).toBe(59 + 10 + 18)
  })

  it('records unchecked and ignored rows without changing sizes', async () => {
    const text = csv(ETF_1, KO_1)
    const [etf] = ingest.parseTransactions(text)
    await ingest.ingest(db, text, {
      known: {},
      mapping: { ...mapping, US1912161007: ingest.SKIP_POSITION },
      apply: all(text).filter((key) => key !== etf.key),
    })
    expect(await positionSize('19747492')).toBe(59)
    expect(await positionSize('331829')).toBe(12)
    const rows = await storage.call(
      db,
      'select position_id, applied from transactions order by datetime'
    )
    expect(rows).toEqual([
      { position_id: '19747492', applied: 0 },
      { position_id: null, applied: 0 },
    ])
  })

  it('creates a new position', async () => {
    const text = csv(KO_1)
    const result = await ingest.ingest(db, text, {
      known: {},
      mapping: { US1912161007: ingest.NEW_POSITION },
      symbols: { US1912161007: 'KO' },
      apply: all(text),
    })
    expect(result.changes).toEqual([
      { id: 'US1912161007', name: 'COCA-COLA CO', from: 0, to: 5 },
    ])
    const [position] = await storage.call(
      db,
      "select * from positions where id='US1912161007'"
    )
    expect(position).toMatchObject({ symbol: 'KO', currency: 'USD', size: 5 })
  })

  it('refuses incomplete mappings and negative sizes', async () => {
    const text = csv(KO_1, WBD_OUT)
    await expect(
      ingest.ingest(db, text, { known: {}, mapping: {}, apply: all(text) })
    ).rejects.toThrow('Choose a position for')
    await expect(
      ingest.ingest(db, text, {
        known: {},
        mapping: { US1912161007: ingest.NEW_POSITION },
        apply: all(text),
      })
    ).rejects.toThrow('Yahoo symbol missing')
    await expect(
      ingest.ingest(db, text, {
        known: {},
        mapping: { ...mapping, US9344231041: '883053' },
        apply: all(text),
      })
    ).rejects.toThrow('would end with -17 shares')
    expect(await ingest.getLastIngested(db)).toBeNull()
  })

  it('does not link two ISINs to one position', async () => {
    const text = csv(KO_1, WBD_OUT)
    await expect(
      ingest.ingest(db, text, {
        known: {},
        mapping: { US1912161007: '331829', US9344231041: '331829' },
        apply: all(text),
      })
    ).rejects.toThrow('already belongs to')
  })

  it('reads the apply keys from the form', () => {
    expect(
      ingest.parseIngestForm({ apply_keys: 'a,b', map: { X: '1' } })
    ).toEqual({ mapping: { X: '1' }, symbols: {}, apply: ['a', 'b'] })
    expect(ingest.parseIngestForm({}).apply).toEqual([])
  })

  it('ingests identical partial fills of one order', async () => {
    const fills = csv(KO_1, KO_1)
    const keys = all(fills)
    expect(new Set(keys).size).toBe(2)
    // the first one keeps the key it would have alone
    expect(keys).toContain(all(csv(KO_1))[0])

    const result = await ingest.ingest(db, fills, {
      known: {},
      mapping,
      apply: keys,
    })
    expect(result.inserted).toBe(2)
    expect(await positionSize('331829')).toBe(12 + 5 + 5)

    const again = await ingest.preview(db, fills, {})
    expect(again.fresh).toEqual([])
  })
})

describe('parseSymbolsForm', () => {
  it('keeps small numeric position ids', () => {
    expect(
      ingest.parseSymbolsForm({ position_symbol: { p1: 'AAA', p4671: '' } })
    ).toEqual({ 1: 'AAA', 4671: '' })
    expect(ingest.parseSymbolsForm({})).toEqual({})
    expect(ingest.parseSymbolsForm({ position_symbol: ['X'] })).toEqual({})
  })

  it('works with what express parses from the form', () => {
    const body = require('qs').parse('position_symbol[p1]=AAA')
    expect(ingest.parseSymbolsForm(body)).toEqual({ 1: 'AAA' })
  })
})

describe('populateFromDaily', () => {
  const daily = (id, name, date, size, price) =>
    storage.run(
      db,
      'insert into stocks_by_daily (id, name, currency, date, size, price) ' +
        'values (?, ?, ?, ?, ?, ?)',
      [id, name, 'USD', date, size, price]
    )

  beforeEach(async () => {
    // Coca-Cola bought 2, then 10 more; old Nokia sold out; unknown holding
    await daily('331829', 'Coca-Cola', '2022-01-19', 2, 60)
    await daily('331829', 'Coca-Cola', '2022-01-20', 2, 61)
    await daily('331829', 'Coca-Cola', '2023-05-02', 12, 62)
    await daily('331829', 'Coca-Cola', '2024-09-19', 12, 70)
    await daily('890163', 'Nokia', '2019-01-01', 10, 4)
    await daily('890163', 'Nokia', '2021-03-31', 0, 4.5)
    await daily('555', 'Unknown', '2023-01-01', 3, 9)
    await daily('555', 'Unknown', '2023-01-02', null, null)
    await storage.run(db, "update positions set size=5 where id='331829'")
  })

  it('creates transactions from size changes and syncs positions', async () => {
    const result = await ingest.populateFromDaily(db)

    expect(result.inserted).toBe(5)
    expect(result.last).toBe('2023-05-02 23:59')
    expect(result.changes).toEqual([
      { id: '331829', name: 'Coca-Cola', from: 5, to: 12 },
    ])
    expect(result.created).toEqual([
      {
        id: '555',
        symbol: '',
        name: 'Unknown',
        currency: 'USD',
        size: 3,
        isin: null,
      },
    ])
    expect(await positionSize('331829')).toBe(12)
    expect(await positionSize('555')).toBe(3)
    // sold out Nokia gets no position
    expect(await positionSize('890163')).toBeUndefined()

    const state = await ingest.pageState(db)
    expect(state.withoutSymbol.map((p) => p.id)).toEqual(['555'])
    expect(state.canPopulate).toBe(true)
    await ingest.setSymbols(db, { 555: ' UNK ', 331829: '' })
    expect((await ingest.pageState(db)).withoutSymbol).toEqual([])

    const rows = await storage.call(
      db,
      'select datetime, size, price, position_id, applied, source ' +
        "from transactions where position_id in ('331829', '890163') " +
        'order by position_id, datetime'
    )
    expect(rows).toEqual([
      ...[
        ['2022-01-19 23:59', 2, 60],
        ['2023-05-02 23:59', 10, 62],
      ].map(([datetime, size, price]) => ({
        datetime,
        size,
        price,
        position_id: '331829',
        applied: 1,
        source: 'stocks_by_daily',
      })),
      ...[
        ['2019-01-01 23:59', 10, 4],
        ['2021-03-31 23:59', -10, 4.5],
      ].map(([datetime, size, price]) => ({
        datetime,
        size,
        price,
        position_id: '890163',
        applied: 1,
        source: 'stocks_by_daily',
      })),
    ])
  })

  it('makes CSV ingest continue after the last size change', async () => {
    await ingest.populateFromDaily(db)
    const preview = await ingest.preview(db, csv(KO_1, ETF_1))
    expect(preview.fresh.map((t) => t.orderId)).toEqual([
      'order-etf-1',
      'order-ko-1',
    ])
    const old = csv(
      KO_1.replace('01-06-2026', '02-05-2023').replace('15:30', '10:00')
    )
    expect((await ingest.preview(db, old)).fresh).toEqual([])
  })

  it('fills symbols and ISINs from the known positions', async () => {
    await storage.run(db, "update positions set symbol='' where id='331829'")
    await storage.run(
      db,
      "update positions set isin='US0000000001' where id='22187048'"
    )
    const known = {
      331829: { symbol: 'KO', isin: 'US1912161007' },
      22187048: { symbol: 'WBD', isin: 'US9344231041' },
      555: { symbol: 'UNK', isin: 'XX0000000555' },
      // already used by another position -> not assigned twice
      883053: { symbol: 'EXI2.DE', isin: 'US0000000001' },
    }
    const result = await ingest.populateFromDaily(db, known)

    expect(result.created).toEqual([
      expect.objectContaining({
        id: '555',
        symbol: 'UNK',
        isin: 'XX0000000555',
      }),
    ])
    expect(result.filled).toEqual([
      { id: '331829', symbol: 'KO', isin: 'US1912161007' },
    ])
    const rows = await storage.call(
      db,
      'select id, symbol, isin from positions order by id'
    )
    expect(rows).toEqual([
      { id: '19747492', symbol: 'ISPA.DE', isin: null },
      { id: '22187048', symbol: 'WBD', isin: 'US0000000001' },
      { id: '331829', symbol: 'KO', isin: 'US1912161007' },
      { id: '555', symbol: 'UNK', isin: 'XX0000000555' },
      { id: '883053', symbol: 'EXI2.DE', isin: null },
    ])
  })

  it('has a valid entry for every known position', () => {
    const { KNOWN_POSITIONS } = require('../src/known_positions.js')
    const isins = Object.values(KNOWN_POSITIONS)
      .map((p) => p.isin)
      .filter(Boolean)
    expect(new Set(isins).size).toBe(isins.length)
    isins.forEach((isin) => expect(isin).toMatch(/^[A-Z]{2}[A-Z0-9]{9}\d$/))
  })

  it('can be re-run until CSV transactions are ingested', async () => {
    await ingest.populateFromDaily(db)
    const again = await ingest.populateFromDaily(db)
    expect(again.inserted).toBe(5)
    expect(again.created).toEqual([])
    const count = await storage.call(
      db,
      'select count(*) as c from transactions'
    )
    expect(count[0].c).toBe(5)

    const text = csv(KO_1)
    await ingest.ingest(db, text, {
      mapping: { US1912161007: '331829' },
      apply: ingest.parseTransactions(text).map((t) => t.key),
    })
    expect((await ingest.pageState(db)).canPopulate).toBe(false)
    await expect(ingest.populateFromDaily(db)).rejects.toThrow(
      'CSV transactions are already ingested'
    )
  })
})

describe('known positions in CSV ingest', () => {
  const known = {
    331829: { symbol: 'KO', isin: 'US1912161007' },
    // not in the positions table
    777: { symbol: 'WBD', isin: 'US9344231041' },
  }
  const all = (text) => ingest.parseTransactions(text).map((t) => t.key)

  it('matches known ISINs without a mapping', async () => {
    const text = csv(KO_1, WBD_OUT.replace(',-19,', ',4,'))
    const preview = await ingest.preview(db, text, known)
    const byIsin = Object.fromEntries(preview.isins.map((i) => [i.isin, i]))
    expect(byIsin.US1912161007.matched.id).toBe('331829')
    expect(byIsin.US9344231041.knownNew).toMatchObject({
      id: '777',
      symbol: 'WBD',
      currency: 'USD',
    })
    const view = ingest.previewView(preview, text)
    const names = Object.fromEntries(
      view.isins.map((i) => [i.isin, i.matchedName])
    )
    expect(names).toEqual({
      US1912161007: 'Coca-Cola (KO, 12)',
      US9344231041: 'new position WBD',
    })

    const result = await ingest.ingest(db, text, { apply: all(text), known })
    expect(result.inserted).toBe(2)
    expect(await positionSize('331829')).toBe(17)
    expect(await positionSize('777')).toBe(4)
    const rows = await storage.call(
      db,
      "select id, symbol, isin from positions where id in ('331829', '777') " +
        'order by id'
    )
    expect(rows).toEqual([
      { id: '331829', symbol: 'KO', isin: 'US1912161007' },
      { id: '777', symbol: 'WBD', isin: 'US9344231041' },
    ])
  })

  it('fills an empty symbol of a matched known position', async () => {
    await storage.run(db, "update positions set symbol='' where id='331829'")
    const text = csv(KO_1)
    await ingest.ingest(db, text, { apply: all(text), known })
    const [row] = await storage.call(
      db,
      "select symbol, isin from positions where id='331829'"
    )
    expect(row).toEqual({ symbol: 'KO', isin: 'US1912161007' })
  })

  it('falls back to manual mapping when the known position has another ISIN', async () => {
    await storage.run(
      db,
      "update positions set isin='US0000000001' where id='331829'"
    )
    const preview = await ingest.preview(db, csv(KO_1), known)
    expect(preview.isins[0].matched).toBeNull()
    expect(preview.isins[0].knownNew).toBeNull()
  })
})
