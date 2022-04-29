const storage = require('../src/storage.js')

exports.inserts = [
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('10306755', 76.8, 50.0, 3840.0, 'MONETA MONEY BANK', 'CZK', '2017-11-27', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('4798004', 500.0, 10.0, 5000.0, 'CEZ', 'CZK', '2017-12-18', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('890163', 3.96, 10.0, 1017.7278012, 'NOKIA OYJ A ADR 1/EO-,06', 'EUR', '2017-12-18', 25.700197);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('8565591', 419.0, 11.0, 4609.0, 'KOFOLA CS', 'CZK', '2018-01-21', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('332111', 92.0, 2.0, 3758.1995591765603, 'Microsoft Corp', 'USD', '2018-02-17', 20.42499760422044);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('1533610', 168.2, 1.0, 3458.1924357583507, 'Facebook', 'USD', '2018-03-21', 20.56000259071552);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('890163', 4.62, 30.0, 3502.3227623999996, 'NOKIA OYJ', 'EUR', '2018-04-17', 25.269284);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('4798008', 924.5, 4.0, 3698.0, 'Komercni Banka AS', 'CZK', '2018-04-17', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('4798015', 914.0, 7.0, 6398.0, 'Erste Group Bank AG', 'CZK', '2018-05-29', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('1533610', 195.4, 2.0, 8654.673743441355, 'Facebook', 'USD', '2018-06-15', 22.14604335578647);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('10306755', 77.25, 67.0, 5175.75, 'MONETA MONEY BANK', 'CZK', '2018-06-15', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('14660208', 70.0, 40.0, 2800.0, 'AVAST PLC', 'CZK', '2018-07-17', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('4798013', 894.0, 5.0, 4470.0, 'Pegas Nonwovens SA', 'CZK', '2018-08-21', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('5212042', 58.2, 53.0, 3084.6000000000004, 'Stock Spirits Group', 'CZK', '2018-08-21', 1.0);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('13200994', 9.14, 25.0, 4977.642318593454, 'Snap', 'USD', '2018-09-24', 21.78399264154684);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('331868', 217.86, 1.0, 4922.110395101124, 'Apple Inc', 'USD', '2018-10-18', 22.59299731525348);`,
  `INSERT INTO stocks (id, price, size, value, name, currency, created_at, ratio) VALUES ('4798017', 227.0, 22.0, 4994.0, 'O2 Czech Republic', 'CZK', '2018-11-17', 1.0);`,
]

exports.insertStocks = async (db) => {
  const promises = exports.inserts.map((insert) => {
    return storage.run(db, insert)
  })
  return Promise.all(promises)
}
