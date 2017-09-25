if (!process.env.NODE_CONFIG_DIR && process.cwd().endsWith('/migrations')) {
  process.env.NODE_CONFIG_DIR = process.cwd() + '/../config'
}
const config = require('../node_modules/config')
const companyAddr = config.get('Ethereum.address.company')
const starbaseEpaAddr = config.get('Ethereum.address.starbaseEarlyPurchaseAmendment')
const StarbaseToken = artifacts.require('./StarbaseToken.sol');
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol');
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol');
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol');

module.exports = (deployer) => {
  return deployer.then(() => {
    return Promise.all([
      deployer.deploy(
        StarbaseCrowdsale,
        starbaseEpaAddr
          ? starbaseEpaAddr
          : StarbaseEarlyPurchaseAmendment.address),
      deployer.deploy(StarbaseMarketingCampaign)
    ])
  }).then(() => {
    return deployer.deploy(
      StarbaseToken,
      companyAddr,
      StarbaseCrowdsale.address,
      StarbaseMarketingCampaign.address)
  })
}
