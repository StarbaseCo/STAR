if (!process.env.NODE_CONFIG_DIR && process.cwd().endsWith('/migrations')) {
  process.env.NODE_CONFIG_DIR = process.cwd() + '/../config'
}
const config = require('../node_modules/config')
const companyAddr = config.get('Ethereum.address.company')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsaleContractW = artifacts.require('./StarbaseCrowdsaleContractW.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')

module.exports = (deployer) => {
  return deployer.then(() => {
    return deployer.deploy(StarbaseCrowdsaleContractW)
  }).then(() => {
    // New STAR Token for the withdrawal contract
    return deployer.deploy(
      StarbaseToken,
      companyAddr,
      StarbaseCrowdsaleContractW.address,
      StarbaseMarketingCampaign.address)
  })
}
