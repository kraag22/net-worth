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

describe('login session', () => {
  const auth = require('../src/authentication.js')
  const originalPassword = process.env.login_password

  const reqWithCookie = (cookie) => ({
    header: (name) => (name === 'Cookie' ? cookie : undefined),
  })

  afterEach(() => {
    if (originalPassword === undefined) {
      delete process.env.login_password
    } else {
      process.env.login_password = originalPassword
    }
  })

  it('rejects every password when none is configured', () => {
    delete process.env.login_password
    expect(auth.check_password('')).toBe(false)
    expect(auth.check_password('anything')).toBe(false)
    expect(auth.is_session_valid(reqWithCookie('nw_session=x'))).toBe(false)
  })

  it('checks the password', () => {
    process.env.login_password = 'secret'
    expect(auth.check_password('secret')).toBe(true)
    expect(auth.check_password('wrong')).toBe(false)
    expect(auth.check_password(undefined)).toBe(false)
  })

  it('accepts only the cookie issued for the current password', () => {
    process.env.login_password = 'secret'
    const token = auth.create_session_token()
    expect(
      auth.is_session_valid(reqWithCookie(`a=1; nw_session=${token}`))
    ).toBe(true)
    expect(auth.is_session_valid(reqWithCookie('nw_session=forged'))).toBe(
      false
    )
    expect(auth.is_session_valid(reqWithCookie(undefined))).toBe(false)

    process.env.login_password = 'changed'
    expect(auth.is_session_valid(reqWithCookie(`nw_session=${token}`))).toBe(
      false
    )
  })
})

describe('require_api_key', () => {
  const { require_api_key } = require('../src/authentication.js')
  const originalKey = process.env.api_server_auth_key

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.api_server_auth_key
    } else {
      process.env.api_server_auth_key = originalKey
    }
  })

  const call = (headerValue) => {
    const result = { next: false, status: null, body: null }
    const req = {
      header: (name) => (name === 'Great-Auth' ? headerValue : undefined),
    }
    const res = {
      status(code) {
        result.status = code
        return this
      },
      json(body) {
        result.body = body
      },
    }
    require_api_key(req, res, () => (result.next = true))
    return result
  }

  it('lets requests with the key through', () => {
    process.env.api_server_auth_key = 'test-key'
    expect(call('test-key')).toEqual({ next: true, status: null, body: null })
  })

  it('rejects requests without the right key', () => {
    process.env.api_server_auth_key = 'test-key'
    const unauthorized = {
      next: false,
      status: 401,
      body: { error: 'Unauthorized' },
    }
    expect(call(undefined)).toEqual(unauthorized)
    expect(call('wrong')).toEqual(unauthorized)
    delete process.env.api_server_auth_key
    expect(call(undefined)).toEqual(unauthorized)
  })
})
