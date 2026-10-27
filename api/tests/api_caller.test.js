const { ServerAPICaller } = require('../src/api_caller.js')

describe('ServerAPICaller', () => {
  let fetchSpy
  const caller = new ServerAPICaller('https://example.test', 'test-key')

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch')
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('posts data using the native Node fetch implementation', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))

    await expect(
      caller.postAveragePriceToServer('flat', 'buy', 100)
    ).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/reality/store_data',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Great-Auth': 'test-key',
        },
        body: JSON.stringify({ name: 'flat', type: 'buy', averagePrice: 100 }),
      }
    )
  })

  it('propagates HTTP failures', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 503 }))
    await expect(
      caller.postAveragePriceToServer('flat', 'buy', 100)
    ).rejects.toThrow('Server responded with status: 503')
  })

  it('propagates network failures', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'))
    await expect(
      caller.postAveragePriceToServer('flat', 'buy', 100)
    ).rejects.toThrow('Network failure')
  })
})
