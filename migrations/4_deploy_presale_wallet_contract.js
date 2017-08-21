if (!process.env.NODE_CONFIG_DIR && process.cwd().endsWith('/migrations')) {
  process.env.NODE_CONFIG_DIR = process.cwd() + '/../config'
}
const config = require('../node_modules/config')
const presaleOwners = config.get('Ethereum.presale.wallet.owners')
const requiredSigns = config.get('Ethereum.presale.wallet.requiredSigns')
const maxCap = config.get('Ethereum.presale.wallet.initialMaxCap')
const StarbasePresaleWallet = artifacts.require('./StarbasePresaleWallet.sol')

module.exports = (deployer) => {
  return deployer.deploy(StarbasePresaleWallet, presaleOwners, requiredSigns, maxCap)
}
