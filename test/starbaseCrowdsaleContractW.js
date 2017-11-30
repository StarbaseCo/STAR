const utils = require('./helpers/utils')
const timer = require('./helpers/timer')

const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseCrowdsaleContractW = artifacts.require('./StarbaseCrowdsaleContractW.sol')
const MultiCertifier = artifacts.require('./MultiCertifier.sol')

contract('StarbaseCrowdsaleContractW', accounts => {
  const owner = accounts[0]
  const ep1 = accounts[1]
  const ep2 = accounts[2]
  const pre1 = accounts[3]
  const pre2 = accounts[4]
  const cs1 = accounts[5]
  const cs2 = accounts[6]
  const cs3 = accounts[7]
  const cs4 = accounts[8]
  const dummy = accounts[9]
  let epa
  let token
  let token2  // Another STAR token contract for csw contract
  let cs
  let csw

  before(async () => {
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 34665, utils.getBlockNow())
    await ep.appendEarlyPurchase(ep2, 5671663, utils.getBlockNow())
    await ep.closeEarlyPurchase()
    epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    cs = await StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
    token = await StarbaseToken.new(dummy, cs.address, dummy)
    await cs.loadEarlyPurchases()
    await cs.setup(token.address, web3.eth.blockNumber + 13)

    // presale
    await cs.setQualifiedPartner(pre1, 1e+18, 0)
    await cs.updateCnyEthRate(1974e+8)
    await cs.sendTransaction({ from: pre1, value: 1e+10 })
    await cs.sendTransaction({ from: pre1, value: 1009e+10 })
    await cs.setQualifiedPartner(pre2, 1e+18, 5)
    await cs.updateCnyEthRate(2390e+8)
    await cs.sendTransaction({ from: pre2, value: 1e+10 })
    await cs.sendTransaction({ from: pre2, value: 5601.240896e+10 })
    await cs.updateCnyEthRate(2158e+8)
    await cs.sendTransaction({ from: pre2, value: 1e+10 })
    await cs.sendTransaction({ from: pre2, value: 15245.2265589266e+10 })
    assert.equal((await cs.totalAmountOfEarlyPurchasesWithoutBonus.call()).toNumber(), 5706328)
    assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 48284451)

    // main sale
    await cs.updateCnyEthRate(2028e+8)
    await cs.setQualifiedPartner(cs1, 1e+18, 0)
    await cs.setQualifiedPartner(cs2, 1e+18, 0)
    await cs.setQualifiedPartner(cs3, 1e+18, 0)
    await cs.setQualifiedPartner(cs4, 1e+18, 0)
    await cs.sendTransaction({ from: cs1, value: 6e+10 })
    await cs.sendTransaction({ from: cs2, value: 0.138e+10 })
    await cs.updateCnyEthRate(2589297e+8)
    await cs.sendTransaction({ from: cs3, value: 1e+10 })
    assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 48284451 + 2601744)  // presale + mainsale
    await cs.updateCnyEthRate(200e+8)
    await cs.sendTransaction({ from: cs4, value: 1e+10 })

    await cs.endCrowdsale(utils.getBlockNow())
  })

  beforeEach('initialize StarbaseCrowdsaleContractW', async () => {
    csw = await StarbaseCrowdsaleContractW.new()
    token2 = await StarbaseToken.new(dummy, csw.address, dummy)
  })

  it('does not allow purchase requests', async () => {
    try {
      await csw.sendTransaction({ from: cs1, value: 1e+10 })
      assert.fail()
    } catch(e) {}

    assert.equal(web3.eth.getBalance(csw.address), 0)
  })

  it('is able to setup addresses of StarbaseCrowdsale and StarbaseToken contracts', async () => {
    await csw.setup(token2.address, cs.address)
    assert.equal(await csw.starbaseToken.call(), token2.address)
    assert.equal(await csw.starbaseCrowdsale.call(), cs.address)
  })

  it('is able to load all crowdsale purchases from StarbaseCrowdsale contract', async () => {
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)
    assert.equal((await csw.crowdsalePurchasesLoaded.call()), true)
    assert.equal((await csw.numOfLoadedCrowdsalePurchases.call()).toNumber(), 10)
    assert.equal((await cs.maxCrowdsaleCap.call()).toNumber(), 61293672)
    assert.equal((await csw.totalAmountOfPresalePurchasesWithoutBonus.call()).toNumber(), 48284451)
  })

  it('calculates correct bonus', async () => {
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)

    // (purchasedAmount, rawAmount, bonusBegin, bonusEnd, bonusTier)
    return Promise.all([
      csw.calculateBonusInRange(0, 1, 0, 2601844, 20),  // r1: within 1st range, 1st purchase, very small one
      csw.calculateBonusInRange(0, 100, 0, 2601844, 20), // r2: within 1st range, 1st purchase
      csw.calculateBonusInRange(0, 2601844, 0, 2601844, 20),  // r3: full of 1st range
      csw.calculateBonusInRange(0, 2601944, 0, 2601844, 20),  // r4: full of 1st range, bonus from 1st range
      csw.calculateBonusInRange(0, 2601944, 2601844, 5203688, 15),  // r5: full of 1st range, bonus from 2nd range
      csw.calculateBonusInRange(0, 5203688, 2601844, 5203688, 15),  // r6: full of 1st and 2nd ranges, bonus from 2nd range
      csw.calculateBonusInRange(200, 100, 0, 2601844, 20),  // r7: within 1st range, not 1st purchase
      csw.calculateBonusInRange(200, 5203788, 0, 2601844, 20),  // r8: over 1st, 2nd, 3rd range, bonus from 1st range
      csw.calculateBonusInRange(200, 5203788, 2601844, 5203688, 15),  // r9: over 1st, 2nd, 3rd range, bonus from 2nd range
      csw.calculateBonusInRange(200, 5203788, 5203688, 7805532, 10),  // r10: over 1st, 2nd, 3rd range, bonus from 3rd range
      csw.calculateBonusInRange(200, 5203788, 7805532, 10407376, 5),  // r11: over 1st, 2nd, 3rd range, bonus from 4th range
    ]).then(([r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11]) => {
      assert.equal(r1.toNumber(), 0)
      assert.equal(r2.toNumber(), 20)
      assert.equal(r3.toNumber(), 520368)
      assert.equal(r4.toNumber(), 520368)
      assert.equal(r5.toNumber(), 15)
      assert.equal(r6.toNumber(), 390276)
      assert.equal(r7.toNumber(), 20)
      assert.equal(r8.toNumber(), 520328)
      assert.equal(r9.toNumber(), 390276)
      assert.equal(r10.toNumber(), 30)
      assert.equal(r11.toNumber(), 0)
    })
  })

  it('calculates bonus amount for each crowdsale purchase loaded from crowdsale contract', async () => {
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)
    assert.equal((await csw.crowdsalePurchasesLoaded.call()), true)
    assert.equal((await cs.crowdsalePurchaseAmountBy.call(cs1)).toNumber(), 14601)  // 12168 + 20% bonus
    assert.equal((await csw.crowdsalePurchaseAmountBy.call(cs1)).toNumber(), 14601)
    assert.equal((await cs.crowdsalePurchaseAmountBy.call(cs2)).toNumber(), 279) // 279 + 0% bonus
    assert.equal((await csw.crowdsalePurchaseAmountBy.call(cs2)).toNumber(), 334) // 279 + 20% bonus
    assert.equal((await cs.crowdsalePurchaseAmountBy.call(cs4)).toNumber(), 200) // 100 + 0% bonus + 100 + 0% bonus
    assert.equal((await csw.crowdsalePurchaseAmountBy.call(cs4)).toNumber(), 235) // 100 + 20% bonus + 100 + 15% bonus
  })

  it('allows to withdraw STAR tokens for each purchasers even if funds did not reach the cap', async () => {
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)
    await csw.addEarlyPurchases()

    assert.equal((await token2.balanceOf.call(csw.address)).toNumber(), 175000000e+18)

    await csw.withdrawPurchasedTokens({ from: cs2 })
    await csw.withdrawPurchasedTokens({ from: pre1 })
    await csw.withdrawPurchasedTokens({ from: ep1 })
    await csw.withdrawPurchasedTokens({ from: cs1 })
    await csw.withdrawPurchasedTokens({ from: ep2 })
    await csw.withdrawPurchasedTokens({ from: pre2 })

    // double withdrawal
    try {
      await csw.withdrawPurchasedTokens({ from: cs1 })
      assert.fail()
    } catch(e) {}
    try {
      await csw.withdrawPurchasedTokens({ from: pre1 })
      assert.fail()
    } catch(e) {}
    try {
      await csw.withdrawPurchasedTokens({ from: ep1 })
      assert.fail()
    } catch(e) {}

    await csw.withdrawPurchasedTokens({ from: cs3 })
    await csw.withdrawPurchasedTokens({ from: cs4 })

    assert.isAtLeast((await token2.balanceOf.call(ep1)).toNumber(), 375226)
    assert.isAtLeast((await token2.balanceOf.call(ep2)).toNumber(), 61392063)
    assert.isAtLeast((await token2.balanceOf.call(pre1)).toNumber(), 4454001)
    assert.isAtLeast((await token2.balanceOf.call(pre2)).toNumber(), 103413129)
    assert.isAtLeast((await token2.balanceOf.call(cs1)).toNumber(), 25091)
    assert.isAtLeast((await token2.balanceOf.call(cs2)).toNumber(), 574)
    assert.isAtLeast((await token2.balanceOf.call(cs3)).toNumber(), 5339512)
    assert.isAtLeast((await token2.balanceOf.call(cs4)).toNumber(), 404)

    assert.isBelow((await token2.balanceOf.call(csw.address)).toNumber(), 1e18) // very fewer reminder
  })

  it('allows to withdraw STAR tokens for each purchasers after funds reached the cap', async () => {
    const cs = await StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
    const token = await StarbaseToken.new(dummy, cs.address, dummy)
    await cs.loadEarlyPurchases()
    await cs.setup(token.address, web3.eth.blockNumber + 13)

    // presale
    await cs.setQualifiedPartner(pre1, 1e+18, 0)
    await cs.updateCnyEthRate(1974e+8)
    await cs.sendTransaction({ from: pre1, value: 1e+10 })
    await cs.sendTransaction({ from: pre1, value: 1009e+10 })
    await cs.setQualifiedPartner(pre2, 1e+18, 5)
    await cs.updateCnyEthRate(2390e+8)
    await cs.sendTransaction({ from: pre2, value: 1e+10 })
    await cs.sendTransaction({ from: pre2, value: 5601.240896e+10 })
    await cs.updateCnyEthRate(2158e+8)
    await cs.sendTransaction({ from: pre2, value: 1e+10 })
    await cs.sendTransaction({ from: pre2, value: 15245.2265589266e+10 })
    assert.equal((await cs.totalAmountOfEarlyPurchasesWithoutBonus.call()).toNumber(), 5706328)
    assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 48284451)

    // main sale
    await cs.updateCnyEthRate(2028e+8)
    await cs.setQualifiedPartner(ep1, 1e+18, 0)
    await cs.setQualifiedPartner(cs3, 1e+18, 0)
    await cs.setQualifiedPartner(cs4, 1e+18, 0)
    await cs.sendTransaction({ from: pre1, value: 6e+10 })
    await cs.sendTransaction({ from: ep1, value: 0.138e+10 })
    await cs.updateCnyEthRate(2589297e+8)
    await cs.sendTransaction({ from: cs3, value: 1e+10 })
    assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 48284451 + 2601744)  // presale + mainsale
    await cs.updateCnyEthRate(10407577e+8)  // 10407477 + 100 CNY (over funding)
    await cs.sendTransaction({ from: cs4, value: 1e+10 }) // this purchase closes the crowdsale

    // crowdsale contract w
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)
    await csw.addEarlyPurchases()

    assert.equal((await token2.balanceOf.call(csw.address)).toNumber(), 175000000e+18)

    await csw.withdrawPurchasedTokens({ from: ep1 })
    await csw.withdrawPurchasedTokens({ from: ep2 })
    await csw.withdrawPurchasedTokens({ from: pre1 })
    await csw.withdrawPurchasedTokens({ from: pre2 })
    await csw.withdrawPurchasedTokens({ from: cs3 })
    await csw.withdrawPurchasedTokens({ from: cs4 })

    assert.isAtLeast((await token2.balanceOf.call(ep1)).toNumber(), 36597 + 497)
    assert.isAtLeast((await token2.balanceOf.call(ep2)).toNumber(), 59832973)
    assert.isAtLeast((await token2.balanceOf.call(pre1)).toNumber(), 3860268 + 21746)
    assert.isAtLeast((await token2.balanceOf.call(pre2)).toNumber(), 89627818)
    assert.isAtLeast((await token2.balanceOf.call(cs3)).toNumber(), 4627737)
    assert.isAtLeast((await token2.balanceOf.call(cs4)).toNumber(), 16663262)

    assert.isBelow((await token2.balanceOf.call(csw.address)).toNumber(), 1e18) // very fewer reminder

    assert.isAtLeast((await csw.numOfPurchasedTokensOnEpBy.call(ep1)).toNumber(), 36597)
    assert.isAtLeast((await csw.numOfPurchasedTokensOnCsBy.call(ep1)).toNumber(), 497)
    assert.equal((await csw.numOfPurchasedTokensOnEpBy.call(pre1)).toNumber(), 0)
    assert.isAtLeast((await csw.numOfPurchasedTokensOnCsBy.call(pre1)).toNumber(), 3860268 + 21746)
  })

  it('delivers right amount of STARs early purchasers', async () => {
    const now = utils.getBlockNow()
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 3500000, now)
    await ep.appendEarlyPurchase(ep2, 3500000, now)
    await ep.closeEarlyPurchase()
    const epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    const cs = await StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
    const token = await StarbaseToken.new(dummy, cs.address, dummy)
    await cs.setup(token.address, web3.eth.blockNumber)
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2028e+8)
    await cs.setQualifiedPartner(cs1, 1e+18, 0)
    await cs.sendTransaction({ from: cs1, value: 6e+10 })

    await timer(2) // wait a couple of secs
    await cs.endCrowdsale(utils.getBlockNow())

    const csw = await StarbaseCrowdsaleContractW.new()
    const token2 = await StarbaseToken.new(dummy, csw.address, dummy)

    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(1)
    await csw.addEarlyPurchases()
    assert.equal((await csw.earlyPurchasedAmountBy(ep1)).toNumber(), 3850000) // 3500000 + 350000 (10% bonus)
    assert.equal((await csw.earlyPurchasedAmountBy(ep2)).toNumber(), 3850000) // 3500000 + 350000 (10% bonus)

    await csw.withdrawPurchasedTokens({ from: ep1 })
    await csw.withdrawPurchasedTokens({ from: ep2 })
    assert.equal((await csw.numOfDeliveredEarlyPurchases.call()).toNumber(), 2)
    assert.equal(
      (await token2.balanceOf(ep1)).toString(),
      (await token2.balanceOf(ep2)).toString())
  })

  it('tracks the number of loaded early purchases', async () => {
    const now = utils.getBlockNow()
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 2, now)
    await ep.appendEarlyPurchase(ep2, 1, now)
    await ep.appendEarlyPurchase(cs1, 1, now)
    await ep.appendEarlyPurchase(cs2, 1, now)

    await ep.closeEarlyPurchase()
    const epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    const cs = await StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
    const token = await StarbaseToken.new(dummy, cs.address, dummy)
    await cs.setup(token.address, web3.eth.blockNumber)
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2028e+8)
    await cs.setQualifiedPartner(pre1, 1e+18, 0)
    await cs.sendTransaction({ from: pre1, value: 6e+10 })

    await timer(2) // wait a couple of secs
    await cs.endCrowdsale(utils.getBlockNow())

    const csw = await StarbaseCrowdsaleContractW.new()
    const token2 = await StarbaseToken.new(dummy, csw.address, dummy)

    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(1)

    const estimatedGas = await csw.addEarlyPurchases.estimateGas()
    await csw.addEarlyPurchases.sendTransaction({ gas: estimatedGas })

    assert.equal((await csw.numOfLoadedEarlyPurchases.call()).toNumber(), 2) // index when gas ran out in the loadEarlyPurchases function.

    assert.equal((await csw.earlyPurchasers(0)), ep1) // two elements in the earlyPurchasers array
    assert.equal((await csw.earlyPurchasers(1)), ep2)
    assert.equal((await csw.earlyPurchasedAmountBy.call(ep1)).toNumber(), 2)
    assert.equal((await csw.earlyPurchasedAmountBy.call(ep2)).toNumber(), 1)

    await csw.addEarlyPurchases() // continues loading earlyPurchasers from index it was left off from

    assert.equal((await csw.numOfLoadedEarlyPurchases.call()).toNumber(), 4) // all should be loaded

    assert.equal((await csw.earlyPurchasers(2)), cs1) // check for next early purchaser loaded after out of gas exception.
    assert.equal((await csw.earlyPurchasers(3)), cs2) // // check for last early purchaser
    assert.equal((await csw.earlyPurchasedAmountBy.call(cs1)).toNumber(), 1)

    assert.equal((await csw.earlyPurchasedAmountBy.call(cs2)).toNumber(), 1)
  })

  it('correctly updates the index even if there are invalidated purchases', async () => {
    const now = utils.getBlockNow()
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 1, now)
    await ep.appendEarlyPurchase(ep2, 2, now)
    await ep.appendEarlyPurchase(cs1, 1, now)
    await ep.appendEarlyPurchase(cs2, 2, now)
    await ep.appendEarlyPurchase(pre2, 1, now)

    await ep.closeEarlyPurchase()
    const epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    await epa.invalidateEarlyPurchase(0)

    const cs = await StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
    const token = await StarbaseToken.new(dummy, cs.address, dummy)
    await cs.setup(token.address, web3.eth.blockNumber)
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2028e+8)
    await cs.setQualifiedPartner(pre1, 1e+18, 0)
    await cs.sendTransaction({ from: pre1, value: 6e+10 })

    await timer(2) // wait a couple of secs
    await cs.endCrowdsale(utils.getBlockNow())

    const csw = await StarbaseCrowdsaleContractW.new()
    const token2 = await StarbaseToken.new(dummy, csw.address, dummy)
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(1)

    const estimatedGas = await csw.addEarlyPurchases.estimateGas()
    await csw.addEarlyPurchases.sendTransaction({ gas: estimatedGas })

    assert.equal((await csw.numOfLoadedEarlyPurchases.call()).toNumber(), 3) // index when gas ran out in the loadEarlyPurchases function.
    assert.equal((await csw.earlyPurchasers(0)), ep2)
    assert.equal((await csw.earlyPurchasers(1)), cs1)
    assert.equal((await csw.earlyPurchasedAmountBy.call(ep2)).toNumber(), 2)
    assert.equal((await csw.earlyPurchasedAmountBy.call(ep1)).toNumber(), 0) // invalidated
    assert.equal((await csw.earlyPurchasedAmountBy.call(cs1)).toNumber(), 1)

    assert.equal((await csw.earlyPurchasedAmountBy.call(cs2)).toNumber(), 0) // not loaded yet
    assert.equal((await csw.earlyPurchasedAmountBy.call(pre2)).toNumber(), 0) // not loaded yet

    await csw.addEarlyPurchases.sendTransaction({ gas: estimatedGas }) // continues loading earlyPurchasers from index it was left off from
    assert.equal((await csw.numOfLoadedEarlyPurchases.call()).toNumber(), 5) // final array index

    assert.equal((await csw.earlyPurchasers(2)), cs2)
    assert.equal((await csw.earlyPurchasedAmountBy.call(cs2)).toNumber(), 2)
    assert.equal((await csw.earlyPurchasers(3)), pre2)
    assert.equal((await csw.earlyPurchasedAmountBy.call(pre2)).toNumber(), 1)
  })

  it('implements abstract functions of AbstractStabaseCrowdsale', async () => {
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)
    await csw.addEarlyPurchases()
    await csw.withdrawPurchasedTokens({ from: ep1 })
    await csw.withdrawPurchasedTokens({ from: pre1 })
    await csw.withdrawPurchasedTokens({ from: cs1 })

    assert.equal((await csw.startDate()).toNumber(), (await cs.startDate()).toNumber())
    assert.equal((await csw.endedAt()).toNumber(), (await cs.endedAt()).toNumber())
    assert.equal(await csw.isEnded(), await cs.isEnded())
    assert.isAtLeast((await csw.numOfPurchasedTokensOnEpBy.call(ep1)).toNumber(), 375226)
    assert.isAtLeast((await csw.numOfPurchasedTokensOnCsBy.call(pre1)).toNumber(), 4454001)
    assert.isAtLeast((await csw.numOfPurchasedTokensOnCsBy.call(cs1)).toNumber(), 25091)
  })

  // this test requires more time and `testrpc --accounts=170`
  it.skip('is able to load many crowdsale purchases without out of gas error', async () => {
    assert.isAtLeast(accounts.length, 170)
    const cs = await StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
    const token = await StarbaseToken.new(dummy, cs.address, dummy)
    await cs.loadEarlyPurchases()
    await cs.setup(token.address, web3.eth.blockNumber + 13)

    // presale
    await cs.setQualifiedPartner(pre1, 1e+18, 0)
    await cs.updateCnyEthRate(1974e+8)
    await cs.sendTransaction({ from: pre1, value: 1e+10 })
    await cs.sendTransaction({ from: pre1, value: 1009e+10 })
    await cs.setQualifiedPartner(pre2, 1e+18, 5)
    await cs.updateCnyEthRate(2390e+8)
    await cs.sendTransaction({ from: pre2, value: 1e+10 })
    await cs.sendTransaction({ from: pre2, value: 5601.240896e+10 })
    await cs.updateCnyEthRate(2158e+8)
    await cs.sendTransaction({ from: pre2, value: 1e+10 })
    await cs.sendTransaction({ from: pre2, value: 15245.2265589266e+10 })
    assert.equal((await cs.totalAmountOfEarlyPurchasesWithoutBonus.call()).toNumber(), 5706328)
    assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 48284451)

    // mainsale
    await cs.updateCnyEthRate(2028e+8)
    await Promise.all(
      [...Array(160).keys()].map(i =>
        cs.setQualifiedPartner(accounts[i + 10], 1e+10, 0).then(() =>
          cs.sendTransaction({ from: accounts[i + 10], value: 1e+10 }))
      )
    )
    await cs.endCrowdsale(utils.getBlockNow())

    // crowdsale contract w
    await csw.setup(token2.address, cs.address)
    await csw.loadCrowdsalePurchases(6)
    assert.isBelow((await csw.numOfLoadedCrowdsalePurchases.call()).toNumber(), 166)
    assert.isFalse(await csw.crowdsalePurchasesLoaded.call())

    await csw.loadCrowdsalePurchases(6)
    assert.equal((await csw.numOfLoadedCrowdsalePurchases.call()).toNumber(), 166)
    assert.isTrue(await csw.crowdsalePurchasesLoaded.call())
  })
})
