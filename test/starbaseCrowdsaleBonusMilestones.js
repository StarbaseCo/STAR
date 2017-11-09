const timer = require('./helpers/timer')
const utils = require('./helpers/utils')

const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const MultiCertifier = artifacts.require('./MultiCertifier.sol')

contract('StarbaseCrowdsale (Bonus Milestones)', accounts => {
  const purchaser1 = accounts[0]
  const purchaser2 = accounts[1]
  const dummyAddr = accounts[2]  // dummy
  const ep1 = accounts[3]

  const firstBonusEnds =  12000000
  const secondBonusEnds = 24000000
  const thirdBonusEnds =  36000000
  const fourthBonusEnds = 48000000

  let epa
  let cs
  let totalAmountOfEP
  const secondsInADay = 86400

  const newCrowdsale = () => {
    return StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
  }

  before('initialize StarbaseEarlyPurchaseAmendment', async () => {
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 7000000, utils.getBlockNow())
    await ep.closeEarlyPurchase()
    epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)
  })

  beforeEach('initialize crowdsale contract', async () => {
    cs = await newCrowdsale()
    await cs.loadEarlyPurchases()
    totalAmountOfEP = await cs.totalAmountOfEarlyPurchasesWithBonus()

    const mkgCampaign = await StarbaseMarketingCampaign.new(dummyAddr)
    const token = await StarbaseToken.new(dummyAddr, cs.address, mkgCampaign.address)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
  })

  it('does NOT allow purchase if it is not a qualified partner', async () => {
    await cs.updateCnyEthRate(2000)
    try {
      await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      assert.fail()
    } catch(error) {
      utils.ensuresException(error)
    }
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)

    // purchase with a qualified partner
    await cs.setQualifiedPartner(purchaser2, 2000000e+18, 0)
    await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })

    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2400)
  })

  it('lets purchasers buy STARs with Ether at 20% bonus tokens when reaching purchases within first bonus tier', async () => {
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2400)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), (totalAmountOfEP.toNumber() + 2400)
    )

    const purchase = await cs.crowdsalePurchases(0)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2400)
  })

  it('lets STARs purchasers to receive 20% bonus tokens at the end of first bonus sales milestones (edge case)', async () => {
    await cs.updateCnyEthRate(firstBonusEnds) // still within first bonus milestones
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 14400000)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 14400000
    )

    const purchase = await cs.crowdsalePurchases(0)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 14400000)
  })

  it('should give 15 % bonus tokens when reaching purchases within second bonus tier', async () => {
    await cs.updateCnyEthRate(firstBonusEnds + 1000) // figure that goes over first bonus milestones


    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 }) // purchase with 15%

    const purchase = await cs.crowdsalePurchases(0)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 14401150) // (12000000 * 1.20) + (1000 * 1.15)
  })

  it('lets STARs purchasers to receive 15% bonus tokens at the end of second bonus sales milestones (edge case)', async () => {
      await cs.updateCnyEthRate(secondBonusEnds) // still second bonus milestones

      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 28200000) // (12000000 * 1.20) + (12000000 * 1.15)
  })

  it('should give 10 % bonus tokens when reaching purchases within third bonus tier', async () => {
      await cs.updateCnyEthRate(secondBonusEnds + 1000) // just over third bonus milestones

      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 }) // purchase with 10%

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 28201100) // (12000000 * 1.20) + (12000000 * 1.15) + (1000 * 1.1)
  })

  it('lets STARs purchasers to receive 10% bonus tokens at the end of third bonus sales milestones (edge case)', async () => {
      await cs.updateCnyEthRate(thirdBonusEnds) // edge figure of third bonus milestones

      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 }) // purchase with 10%

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 41400000) // (12000000 * 1.20) + (12000000 * 1.15) + (12000000 * 1.1)
  })

  it('should give 5 % bonus tokens when reaching purchases within fourth bonus tier', async () => {
      await cs.updateCnyEthRate(thirdBonusEnds + 1000) // figure that goes over third bonus milestones

      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 }) // purchase with 5%

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 41401050) // (12000000 * 1.20) + (12000000 * 1.15) + (12000000 * 1.1) + (1000 * 1.05)
  })

  it('lets STARs purchasers to receive 5% bonus tokens at the end of fourth bonus sales milestones (edge case)', async () => {
      await cs.updateCnyEthRate(fourthBonusEnds) // still in fourth bonus milestones

      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 }) // purchase with 5%

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 54000000) // (12000000 * 1.20) + (12000000 * 1.15) + (12000000 * 1.1) + (12000000 * 1.05)
  })

  it('should give 0 % bonus tokens for purchasers reaching purchases within fifth bonus tier', async () => {
      await cs.updateCnyEthRate(fourthBonusEnds + 1000) // goes over fourth bonus milestones

      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 }) // purchase with 0%

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 54001000) // (12000000 * 1.20) + (12000000 * 1.15) + (12000000 * 1.1) + (12000000 * 1.05) + 1000
  })
})
