exports.is_request_authenticated = (req) => {
  const authHeader = req.header('Great-Auth')
  return authHeader === process.env.api_server_auth_key
}
