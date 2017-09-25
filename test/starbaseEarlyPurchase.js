const utils = require('./helpers/utils')

const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')

contract('StarbaseEarlyPurchase', accounts => {
  const eth = web3.eth
  const founder = eth.accounts[0]
  const account1 = eth.accounts[1]
  const account2 = eth.accounts[2]
  const company  = eth.accounts[3]

  const newEP = () => StarbaseEarlyPurchase.new()
  const currentTimestamp = () => Math.floor(Date.now() / 1000)

  it('should be able to setup address of StarbaseCrowdsale contract', async () => {
    // const ep = await newEP()
    // await ep.setup(StarbaseCrowdsale.deployed().address)
    // const epSpAddress = await ep.starbaseCrowdsale;
    // assert.equal(
    //   .call(),
    //   StarbaseCrowdsale.deployed().address)
  })

  it('should have no early purchased amount initially', async () => {
    const ep = await newEP()
    await Promise.all([
      ep.numberOfEarlyPurchases.call(),
      ep.totalAmountOfEarlyPurchases.call()
    ]).then(([x, y]) => {
      assert.equal(x.toNumber(), 0)
      assert.equal(y.toNumber(), 0)
    })
  })

  it('should not accepet zero amount purchase', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 0, currentTimestamp())
    const num = await ep.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 0)
  })

  it('should be able to append early purchases', async () => {
    const time1 = currentTimestamp() - 2000
    const time2 = currentTimestamp() - 1000
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, time1)
    await ep.appendEarlyPurchase(account2, 20000, time2)

    await Promise.all([
      ep.numberOfEarlyPurchases.call(),
      ep.totalAmountOfEarlyPurchases.call(),
      ep.earlyPurchases.call(0),
      ep.earlyPurchases.call(1)
    ]).then(([x, y, ep1, ep2]) => {
      assert.equal(x.toNumber(), 2)
      assert.equal(y.toNumber(), 30000)
      assert.equal(ep1[0], account1)
      assert.equal(ep1[1], 10000)
      assert.equal(ep1[2], time1)
      assert.equal(ep2[0], account2)
      assert.equal(ep2[1], 20000)
      assert.equal(ep2[2], time2)
    })
  })

  it("should be able to show purchased amount by purchaser's address", async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.appendEarlyPurchase(account2, 20000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 30000, currentTimestamp())
    assert.equal((await ep.purchasedAmountBy.call(account1)).toNumber(), 40000)
  })

  it('only owner can append early purchases', async () => {
    const ep = await newEP()
    try {
      await ep.appendEarlyPurchase(
        account2, 10000, currentTimestamp(), { from: account1 })
    } catch (e) {
      utils.ensuresException(e)
    }

    await Promise.all([
      ep.numberOfEarlyPurchases.call(),
      ep.totalAmountOfEarlyPurchases.call()
    ]).then(([x, y]) => {
      assert.equal(x.toNumber(), 0)
      assert.equal(y.toNumber(), 0)
    })
  })

  it('should not allow to append early purchases after Crowdsale started', async () => {
    const ep = await newEP()
    const cs = await StarbaseCrowdsale.new(ep.address)
    await ep.setup(cs.address)
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    assert.equal((await ep.numberOfEarlyPurchases.call()).toNumber(), 1)

    const mkgCampaign = await StarbaseMarketingCampaign.new()
    const token = await StarbaseToken.new(company, cs.address, mkgCampaign.address)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.updateCnyBtcRate(20000)
    await cs.recordOffchainPurchase(account2, 0, utils.getBlockNow(), 'btc:xxx') // starts the crowdsale
    try {
      await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    } catch (e) {
      utils.ensuresException(e)
    }
    assert.equal((await ep.numberOfEarlyPurchases.call()).toNumber(), 1)
  })

  it('should be able to close Early Purchase term by owner', async () => {
    const ep = await newEP()

    await ep.closeEarlyPurchase()
    const earlyPurchaseClosedAt = await ep.earlyPurchaseClosedAt()

    try {
      await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    } catch (e) {
      utils.ensuresException(e)
    }

    await Promise.all([
      ep.earlyPurchaseClosedAt.call(),
      ep.numberOfEarlyPurchases.call()
    ]).then(([x, y]) => {
      assert.equal(x.toNumber(), earlyPurchaseClosedAt)
      assert.equal(y.toNumber(), 0)
    })
  })
})
