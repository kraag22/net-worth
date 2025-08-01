const fetch = require('node-fetch')

class ServerAPICaller {
  constructor(apiUrl, password) {
    this.apiUrl = apiUrl
    this.password = password
  }

  postAveragePriceToServer = async (name, type, averagePrice) => {
    try {
      const response = await fetch(`${this.apiUrl}/reality/store_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Great-Auth': this.password,
        },
        body: JSON.stringify({ name, type, averagePrice }),
      })

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`)
      }

      const data = await response.json()
      return data['status'] == 'ok'
    } catch (error) {
      console.error('Failed to post average price to server:', error)
      throw error
    }
  }
}

exports.ServerAPICaller = ServerAPICaller
