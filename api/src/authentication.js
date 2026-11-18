const crypto = require('crypto')

const SESSION_COOKIE = 'nw_session'
// Browsers cap cookie lifetime (Chrome at 400 days), so the cookie is
// re-issued on every authenticated request to keep the user logged in.
const SESSION_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000

exports.SESSION_COOKIE = SESSION_COOKIE
exports.SESSION_MAX_AGE_MS = SESSION_MAX_AGE_MS

exports.is_request_authenticated = (req) => {
  const authHeader = req.header('Great-Auth')
  const authKey = process.env.api_server_auth_key
  return (
    typeof authKey === 'string' && authKey.length > 0 && authHeader === authKey
  )
}

const getPassword = () => {
  const password = process.env.login_password
  return typeof password === 'string' && password.length > 0 ? password : null
}

const safeEqual = (a, b) => {
  const bufA = crypto.createHash('sha256').update(String(a)).digest()
  const bufB = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(bufA, bufB)
}

// Token derived from the password, so changing the password logs everyone out.
const sessionToken = (password) =>
  crypto
    .createHmac('sha256', password)
    .update('net-worth-session')
    .digest('hex')

exports.check_password = (candidate) => {
  const password = getPassword()
  return (
    password !== null &&
    typeof candidate === 'string' &&
    safeEqual(candidate, password)
  )
}

exports.create_session_token = () => {
  const password = getPassword()
  if (password === null) throw new Error('login_password is not configured')
  return sessionToken(password)
}

const parseCookies = (header) => {
  const cookies = {}
  if (typeof header !== 'string') return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    try {
      cookies[name] = decodeURIComponent(value)
    } catch (e) {
      cookies[name] = value
    }
  }
  return cookies
}

exports.is_session_valid = (req) => {
  const password = getPassword()
  if (password === null) return false
  const token = parseCookies(req.header('Cookie'))[SESSION_COOKIE]
  return typeof token === 'string' && safeEqual(token, sessionToken(password))
}

exports.set_session_cookie = (req, res) => {
  res.cookie(SESSION_COOKIE, exports.create_session_token(), {
    maxAge: SESSION_MAX_AGE_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
  })
}

exports.require_login = (req, res, next) => {
  if (exports.is_session_valid(req)) {
    exports.set_session_cookie(req, res)
    return next()
  }
  if (req.accepts(['html', 'json']) === 'html' && req.method === 'GET') {
    return res.redirect('/login')
  }
  return res.status(401).json({ error: 'Unauthorized' })
}
