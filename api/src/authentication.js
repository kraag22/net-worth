exports.is_request_authenticated = (req) => {
  const authHeader = req.header('Great-Auth')
  const authKey = process.env.api_server_auth_key
  return (
    typeof authKey === 'string' && authKey.length > 0 && authHeader === authKey
  )
}
