require('babel-register')
require('babel-polyfill')

module.exports = {
  networks: {
    live: {
      network_id: 1, // Ethereum public network
      host: "localhost",
      port: 8545,
      gas: 4712388 // 100 times more gas than live network.
    },
    testnet: {
      network_id: 3, // Official Ethereum test network (Ropsten)
      host: "localhost",
      port: 8545,
      gas: 4712388
    },
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gas: 4712388
    }
  },
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/"
  }
};
