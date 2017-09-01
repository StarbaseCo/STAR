const MultiSigWalletFactory = artifacts.require('./MultiSigWalletFactory.sol')

module.exports = (deployer) => {
  return deployer.deploy(MultiSigWalletFactory)
}
