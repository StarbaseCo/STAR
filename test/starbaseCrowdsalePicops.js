const utils = require('./helpers/utils')

const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const MultiCertifier = artifacts.require('./MultiCertifier.sol')

contract('StarbaseCrowdsale (PICOPS integration)', accounts => {
  const purchaser1 = accounts[0]
  const purchaser2 = accounts[1]
  const dummyAddr = accounts[2]  // dummy
  const ep1 = accounts[3]

  let certifier
  let epa
  let cs
  let token

  const newCrowdsale = () => {
    return StarbaseCrowdsale.new(epa.address, certifier.address)
  }

  before('initialize StarbaseEarlyPurchaseAmendment', async () => {
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 7000000, utils.getBlockNow())
    await ep.closeEarlyPurchase()
    epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    certifier = await MultiCertifier.new()
    await certifier.certify(purchaser1)
  })

  beforeEach('initialize crowdsale contract', async () => {
    cs = await newCrowdsale()
    const mkgCampaign = await StarbaseMarketingCampaign.new(dummyAddr)
    token = await StarbaseToken.new(dummyAddr, cs.address, mkgCampaign.address)
  })

  it('allows purchase if it is a whitelisted address by PICOPS', async () => {
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.updateCnyEthRate(2000)
    assert.equal(await certifier.certified(purchaser1), true)  // whitelisted addr

    await cs.sendTransaction({ from: purchaser1, value: 1e+15 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2)
  })

  it('does NOT allow purchase if it is not a whitelisted address by PICOPS', async () => {
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.updateCnyEthRate(2000)
    assert.equal(await certifier.certified(purchaser2), false)  // unwhitelisted addr

    try {
      await cs.sendTransaction({ from: purchaser2, value: 1e+15 })
      assert.fail()
    } catch(error) {
      utils.ensuresException(error)
    }
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 0)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
  })

  it('does NOT allow pre-purchase even if it is a whitelisted address by PICOPS', async () => {
    await cs.setup(token.address, web3.eth.blockNumber + 10)  // future
    await cs.updateCnyEthRate(2000)
    assert.equal(await certifier.certified(purchaser1), true)  // whitelisted addr

    try {
      await cs.sendTransaction({ from: purchaser1, value: 1e+15 })  // pre-purchase
      assert.fail()
    } catch(error) {
      utils.ensuresException(error)
    }
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 0)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
  })
})
