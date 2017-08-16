const StarbaseEarlyPurchase = artifacts.require("./StarbaseEarlyPurchase.sol");

module.exports = (deployer) => {
  deployer.deploy(StarbaseEarlyPurchase)
}
