const backfill = require('../src/backfill.js')
const ingest = require('../src/ingest.js')
const storage = require('../src/storage.js')
const { Yahoo } = require('../src/yahoo.js')

class MockHistory {
  constructor(histories) {
    this.histories = histories
    this.asked = []
  }

  async getHistory(symbol, from) {
    this.asked.push([symbol, from])
    if (!this.histories[symbol]) throw new Error('No price history returned')
    return this.histories[symbol]
  }
}

const HISTORIES = {
  KO: {
    currency: 'USD',
    // Friday close carries over the weekend
    closes: {
      '2024-12-01': 59,
      '2025-01-02': 60,
      '2025-01-03': 61,
      '2025-01-06': 62,
    },
  },
  'CEZ.PR': {
    currency: 'CZK',
    closes: { '2025-01-02': 1000, '2025-01-03': 1010, '2025-01-06': 1020 },
  },
  'USDCZK=X': {
    currency: 'CZK',
    closes: { '2025-01-01': 24, '2025-01-03': 25, '2025-01-06': 26 },
  },
}

let db = null

const addPosition = (id, symbol, name, currency, size) =>
  storage.upsertPosition(db, { id, symbol, name, currency, size })

const addTransaction = (positionId, datetime, size, source, price = null) =>
  ingest.insertTransaction(db, {
    key: `${positionId}|${datetime}|${size}`,
    datetime,
    product: positionId,
    size,
    price,
    currency: positionId === 'ko' ? 'USD' : 'CZK',
    positionId,
    applied: true,
    source,
  })

const addStock = (id, size, price, ratio, createdAt) =>
  storage.run(
    db,
    'insert into stocks (id, price, size, value, name, currency, ratio, ' +
      'created_at) values (?,?,?,?,?,?,?,?)',
    [
      id,
      price,
      size,
      price * size * ratio,
      id,
      ratio === 1 ? 'CZK' : 'USD',
      ratio,
      createdAt,
    ]
  )

const stocks = (where = '1=1') =>
  storage.call(
    db,
    'select id, size, price, ratio, round(value, 2) as value, created_at ' +
      `from stocks where ${where} order by created_at, id`
  )

beforeEach(async () => {
  db = await storage.connectDb(':memory:')
  await addPosition('ko', 'KO', 'Coca-Cola', 'USD', 15)
  await addPosition('cez', 'CEZ.PR', 'CEZ', 'CZK', 0)
  // history: 10 KO and 5 CEZ held when the imports stopped
  await addTransaction('ko', '2024-12-01 23:59', 10, ingest.SOURCE_DAILY)
  await addTransaction('cez', '2024-12-01 23:59', 5, ingest.SOURCE_DAILY)
  await addStock('ko', 10, 59, 23, '2024-12-01 10:00:00')
  await addStock('cez', 5, 990, 1, '2024-12-01 10:00:00')
  // the CSV: KO bought on Friday, CEZ sold on Saturday's import gap
  await addTransaction('ko', '2025-01-03 15:30', 5, ingest.SOURCE_CSV, 61)
  await addTransaction('cez', '2025-01-04 10:00', -5, ingest.SOURCE_CSV, 1010)
})

afterEach((done) => {
  db.close(done)
})

describe('backfillStocks', () => {
  it('fills days without any import from transactions and Yahoo', async () => {
    const prices = new MockHistory(HISTORIES)
    const result = await backfill.backfillStocks(db, prices, {
      from: '2025-01-02',
      to: '2025-01-05',
    })

    expect(result).toMatchObject({
      inserted: 7,
      corrected: 0,
      estimated: [],
      changed: [{ from: '2025-01-02', to: '2025-01-05' }],
    })
    const rows = await stocks("created_at >= '2025'")
    const ko = rows.filter((r) => r.id === 'ko')
    expect(
      ko.map((r) => [r.created_at.slice(0, 10), r.size, r.price, r.ratio])
    ).toEqual([
      ['2025-01-02', 10, 60, 24],
      ['2025-01-03', 15, 61, 25],
      ['2025-01-04', 15, 61, 25],
      ['2025-01-05', 15, 61, 25],
    ])
    expect(ko[1].value).toBe(15 * 61 * 25)
    // CEZ gets a size 0 row on the day it was sold, nothing after
    const cez = rows.filter((r) => r.id === 'cez')
    expect(
      cez.map((r) => [r.created_at.slice(0, 10), r.size, r.ratio])
    ).toEqual([
      ['2025-01-02', 5, 1],
      ['2025-01-03', 5, 1],
      ['2025-01-04', 0, 1],
    ])
    // from a week before the last stored price, one FX pair
    expect(prices.asked).toEqual([
      ['KO', '2024-11-24'],
      ['CEZ.PR', '2024-11-24'],
      ['USDCZK=X', '2024-12-26'],
    ])
  })

  it('corrects sizes imported after the history and adds missing positions', async () => {
    // imported with stale sizes; CEZ was still held, KO missing completely
    await addStock('cez', 5, 1005, 1, '2025-01-02 09:00:00')
    await addStock('cez', 5, 1007, 1, '2025-01-06 09:00:00')
    const result = await backfill.backfillStocks(
      db,
      new MockHistory(HISTORIES),
      { from: '2025-01-02', to: '2025-01-06' }
    )

    expect(result.corrected).toBe(1)
    const rows = await stocks("created_at >= '2025-01-06'")
    expect(rows).toEqual([
      expect.objectContaining({ id: 'cez', size: 0, value: 0 }),
      // added at the time of that day's import
      expect.objectContaining({
        id: 'ko',
        size: 15,
        price: 62,
        created_at: '2025-01-06 09:00:00',
      }),
    ])
  })

  it('does nothing the second time', async () => {
    const options = { from: '2025-01-02', to: '2025-01-05' }
    await backfill.backfillStocks(db, new MockHistory(HISTORIES), options)
    const prices = new MockHistory(HISTORIES)
    const again = await backfill.backfillStocks(db, prices, options)
    expect(again).toMatchObject({ inserted: 0, corrected: 0 })
    expect(prices.asked).toEqual([])
  })

  it('estimates prices without Yahoo history from known prices', async () => {
    await addStock('ko', 15, 70, 26, '2025-01-06 09:00:00')
    const { KO, ...withoutKo } = HISTORIES
    const result = await backfill.backfillStocks(
      db,
      new MockHistory(withoutKo),
      {
        from: '2025-01-02',
        to: '2025-01-05',
      }
    )

    expect(result.estimated).toEqual([
      expect.objectContaining({ id: 'ko', days: 4 }),
    ])
    const ko = await stocks("id = 'ko' and created_at like '2025-01-0_ 22%'")
    // 59 (2024-12-01) .. 61 (CSV price 2025-01-03) .. 70 (2025-01-06)
    expect(ko.map((r) => Math.round(r.price * 100) / 100)).toEqual([
      60.94, 61, 64, 67,
    ])
  })

  it('changes nothing when a day cannot be priced', async () => {
    await addPosition('new', '', 'Unknown', 'CZK', 3)
    await addTransaction('new', '2025-01-03 10:00', 3, ingest.SOURCE_CSV)
    const before = await stocks()

    await expect(
      backfill.backfillStocks(db, new MockHistory(HISTORIES), {
        from: '2025-01-02',
        to: '2025-01-05',
      })
    ).rejects.toThrow('new: Unknown: no Yahoo price nor any known price')
    expect(await stocks()).toEqual(before)
  })

  it('fills every hole since the first transaction by default', async () => {
    const plan = await backfill.plan(db, { to: '2024-12-02' })
    expect(plan.start).toBe('2024-12-01')
    // 2024-12-01 has an import
    expect(plan.inserts.map((i) => i.date)).toEqual([
      '2024-12-02',
      '2024-12-02',
    ])
  })

  it('prices sold positions missing in positions from their stored prices', async () => {
    await addTransaction('old', '2024-12-01 23:59', 2, ingest.SOURCE_DAILY)
    await addTransaction('old', '2025-01-03 11:00', -2, ingest.SOURCE_CSV)
    await addStock('old', 2, 100, 1, '2024-12-01 10:00:00')
    const result = await backfill.backfillStocks(
      db,
      new MockHistory(HISTORIES),
      { from: '2025-01-02', to: '2025-01-05' }
    )

    expect(result.estimated).toEqual([
      { id: 'old', name: 'old', reason: 'no Yahoo symbol', days: 2 },
    ])
    const old = await stocks("id = 'old' and created_at >= '2025'")
    expect(
      old.map((r) => [r.created_at.slice(0, 10), r.size, r.price])
    ).toEqual([
      ['2025-01-02', 2, 100],
      ['2025-01-03', 0, 100],
    ])
  })

  it('does not trust Yahoo prices far from the stored ones', async () => {
    // e.g. closes not adjusted the way the stored sizes are
    const scaled = Object.fromEntries(
      Object.entries(HISTORIES.KO.closes).map(([d, c]) => [d, c * 4])
    )
    const result = await backfill.backfillStocks(
      db,
      new MockHistory({
        ...HISTORIES,
        KO: { currency: 'USD', closes: scaled },
      }),
      { from: '2025-01-02', to: '2025-01-05' }
    )

    expect(result.estimated).toEqual([
      expect.objectContaining({
        id: 'ko',
        reason: 'KO: close 236 differs from stored 59 on 2024-12-01',
      }),
    ])
    const ko = await stocks("id = 'ko' and created_at >= '2025'")
    expect(ko.every((r) => r.price >= 59 && r.price <= 61)).toBe(true)
  })
})

describe('fillDaily', () => {
  it('rebuilds events and stocks_by_daily from the first changed day', async () => {
    // aggregated before, up to a later day
    await storage.run(
      db,
      "insert into stocks_by_daily (id, date, size) values ('x', '2025-01-10', 1)"
    )
    const result = await backfill.fillDaily(db, new MockHistory(HISTORIES), {
      from: '2025-01-02',
      to: '2025-01-05',
    })
    expect(result.recomputed).toEqual([
      { from: '2025-01-02', to: '2025-01-05' },
      expect.objectContaining({ from: '2025-01-10' }),
    ])

    const daily = await storage.call(
      db,
      'select id, date, size from stocks_by_daily ' +
        "where date between '2025-01-02' and '2025-01-05' order by date, id"
    )
    expect(daily.map((r) => `${r.date} ${r.id} ${r.size}`)).toEqual([
      '2025-01-02 cez 5',
      '2025-01-02 ko 10',
      '2025-01-03 cez 5',
      '2025-01-03 ko 15',
      '2025-01-04 cez 0',
      '2025-01-04 ko 15',
      '2025-01-05 ko 15',
    ])
    const events = await storage.call(
      db,
      "select id, size, date from events where date >= '2025' order by date"
    )
    expect(events).toEqual([
      { id: 'ko', size: 15, date: '2025-01-03' },
      { id: 'cez', size: 0, date: '2025-01-04' },
    ])
  })
})

describe('helpers', () => {
  it('interpolates between known prices', () => {
    const anchors = [
      { date: '2025-01-01', price: 10 },
      { date: '2025-01-11', price: 20 },
    ]
    expect(backfill.estimateOn(anchors, '2024-12-01')).toBe(10)
    expect(backfill.estimateOn(anchors, '2025-01-06')).toBe(15)
    expect(backfill.estimateOn(anchors, '2025-02-01')).toBe(20)
    expect(backfill.estimateOn([], '2025-02-01')).toBeNull()
  })

  it('merges consecutive days', () => {
    expect(
      backfill.dayRanges([
        '2025-01-03',
        '2025-01-01',
        '2025-01-02',
        '2025-01-05',
      ])
    ).toEqual([
      { from: '2025-01-01', to: '2025-01-03' },
      { from: '2025-01-05', to: '2025-01-05' },
    ])
  })

  it('summarizes problems per position', () => {
    expect(
      backfill.summarize([
        { id: 'a', date: '2025-01-03', problem: 'x' },
        { id: 'a', date: '2025-01-02', problem: 'x' },
      ])
    ).toEqual(['a: x (2025-01-02..2025-01-03, 2 days)'])
  })
})

describe('Yahoo.getHistory', () => {
  it('returns closes by exchange date', async () => {
    const http = {
      get: async () => ({
        data: {
          chart: {
            result: [
              {
                meta: { currency: 'USD', gmtoffset: -18000 },
                // 2024-06-08 01:30 UTC is still 2024-06-07 in New York
                timestamp: [1717767000, 1717810200, 1718026200],
                indicators: { quote: [{ close: [120.9, null, 121.8] }] },
              },
            ],
          },
        },
      }),
    }
    const history = await new Yahoo(http).getHistory('NVDA', '2024-06-01')
    expect(history).toEqual({
      currency: 'USD',
      closes: { '2024-06-07': 120.9, '2024-06-10': 121.8 },
    })
  })
})
