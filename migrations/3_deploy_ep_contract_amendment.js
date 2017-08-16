const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')

module.exports = (deployer) => {
  deployer.deploy(StarbaseEarlyPurchaseAmendment)
}
