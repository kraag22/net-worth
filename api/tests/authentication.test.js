const { is_request_authenticated } = require('../src/authentication.js')

describe('request authentication', () => {
  const originalKey = process.env.api_server_auth_key

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.api_server_auth_key
    } else {
      process.env.api_server_auth_key = originalKey
    }
  })

  it('rejects requests when no server key is configured', () => {
    delete process.env.api_server_auth_key
    expect(is_request_authenticated({ header: () => undefined })).toBe(false)

    process.env.api_server_auth_key = ''
    expect(is_request_authenticated({ header: () => '' })).toBe(false)
  })

  it('requires the configured key in the authentication header', () => {
    process.env.api_server_auth_key = 'test-key'
    expect(is_request_authenticated({ header: () => undefined })).toBe(false)
    expect(is_request_authenticated({ header: () => 'wrong-key' })).toBe(false)
    expect(
      is_request_authenticated({
        header: (name) => (name === 'Great-Auth' ? 'test-key' : undefined),
      })
    ).toBe(true)
  })
})
