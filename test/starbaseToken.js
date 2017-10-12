const utils = require('./helpers/utils')
const timer = require('./helpers/timer')

const StarbaseToken = artifacts.require("./StarbaseToken.sol")
const StarbaseCrowdsale = artifacts.require("./StarbaseCrowdsale.sol")
const StarbaseMarketingCampaign = artifacts.require("./StarbaseMarketingCampaign.sol")
const StarbaseEarlyPurchase = artifacts.require("./StarbaseEarlyPurchase.sol")
const StarbaseEarlyPurchaseAmendment = artifacts.require("./StarbaseEarlyPurchaseAmendment.sol")

const secsInMonths = (m) => m * 30 * 86400

contract('StarbaseToken', accounts => {
  const eth = web3.eth
  const founder1 = eth.accounts[0]
  const ec1 = eth.accounts[1] // early contributor
  const ec2 = eth.accounts[2]
  const company = eth.accounts[3]
  const ep1 = eth.accounts[4]
  const cs1 = eth.accounts[5]
  const someone = eth.accounts[6]

  let crowdsale
  let mkgCampaign
  let earlyPurchase
  let earlyPurchaseAmendment

  const newToken = (customCrowdsale, customMkgCampaign) => {
    return StarbaseToken.new(
      company,
      customCrowdsale ? customCrowdsale.address : crowdsale.address,
      customMkgCampaign ? customMkgCampaign.address : mkgCampaign.address)
  }

  const newCrowdsale = (customEpa) => {
    if (customEpa) {
      return StarbaseCrowdsale.new(customEpa.address)
    } else {
      let ep, epa
      return StarbaseEarlyPurchase.new().then(x => {
        ep = x
        return ep.closeEarlyPurchase()
      }).then(() => {
        return StarbaseEarlyPurchaseAmendment.new()
      }).then(x => {
        epa = x
        epa.loadStarbaseEarlyPurchases(ep.address)
      }).then(() => {
        return StarbaseCrowdsale.new(epa.address)
      })
    }
  }

  before(() => {
    return Promise.all([
      StarbaseCrowdsale.deployed(),
      StarbaseMarketingCampaign.deployed(),
      StarbaseEarlyPurchase.deployed(),
      StarbaseEarlyPurchaseAmendment.deployed()
    ]).then(([x, y, z, a]) => {
      crowdsale = x
      mkgCampaign = y
      earlyPurchase = z
      earlyPurchaseAmendment = a
    })
  })

  it('should have 750M tokens allocated to the company initially', async () => {
    const token = await newToken()
    const balance =  await token.balanceOf.call(company)
    assert.equal(balance.toNumber(), 750000000e+18)
  })

  it('should have 17.5M tokens allocated to the crowdsale contract initially', async () => {
    const token = await newToken()
    const balance = await token.balanceOf.call(crowdsale.address)
    assert.equal(balance.toNumber(), 175000000e+18)
  })

  it('should have 12.5M tokens allocated to the marketing campaign contract initially', async () => {
    const token = await newToken()
    const balance = await token.balanceOf.call(mkgCampaign.address)
    assert.equal(balance.toNumber(), 12500000e+18)
  })

  it("should have 62.5M tokens to allocate early contributors on address '0' initially", async () => {
    const token = await newToken()
    const balance = await token.balanceOf.call(0)
    assert.equal(balance.toNumber(), 62500000e+18)
  })

  it('does NOT allocate to early contributor without a contributor address', async () => {
    const token = await newToken()
    try {
      await token.allocateToEarlyContributor('0x0', 10000e+18)
      assert.fail()
    } catch(e) {
      utils.ensuresException(e)
    }
  })

  it('does NOT allocate to marketing supporter without a supporter address', async () => {
    const token = await newToken()
    try {
      await token.allocateToMarketingSupporter('0x0', 10000e+18)
      assert.fail()
    } catch(e) {
      utils.ensuresException(e)
    }
  })

  it('does NOT allocate to crowdsale purchaser to an empty purchaser address', async () => {
    const token = await newToken()
    try {
      await token.allocateToCrowdsalePurchaser('0x0', 10000e+18)
      assert.fail()
    } catch(e) {
      utils.ensuresException(e)
    }
  })

  it('should be able to allocate tokens to an early contributor', async () => {
    const token = await newToken()
    await token.allocateToEarlyContributor(ec1, 10000e+18)
    await token.allocateToEarlyContributor(ec2, 10000e+18)
    await token.allocateToEarlyContributor(ec1, 10000e+18)
    assert.equal((await token.balanceOf.call(0)).toNumber(), 62470000e+18)
    assert.equal((await token.balanceOf.call(ec1)).toNumber(), 20000e+18)
    assert.equal((await token.balanceOf.call(ec2)).toNumber(), 10000e+18)

    // allocate max
    await token.allocateToEarlyContributor(ec2, 62470000e+18)
    assert.equal((await token.balanceOf.call(0)).toNumber(), 0)
    assert.equal((await token.balanceOf.call(ec2)).toNumber(), 62480000e+18)
  })

  it('should not be able to allocate minus tokens to an early contributor', async () => {
    const token = await newToken()
    try {
      await token.allocateToEarlyContributor(ec1, -10000e+18)
    } catch (err) {
      // ignore exception
    }
    assert.equal((await token.balanceOf.call(0)).toNumber(), 62500000e+18)
    assert.equal((await token.balanceOf.call(ec1)).toNumber(), 0)
  })

  it('should not be able to allocate tokens to an early contributor more than its budget', async () => {
    const token = await newToken()
    await token.allocateToEarlyContributor(ec1, 100000e+18)
    try {
      await token.allocateToEarlyContributor(ec2, 62500000e+18)
    } catch (err) {
      // ignore exception
    }
    assert.equal((await token.balanceOf.call(0)).toNumber(), 62400000e+18)
    assert.equal((await token.balanceOf.call(ec1)).toNumber(), 100000e+18)
    assert.equal((await token.balanceOf.call(ec2)).toNumber(), 0)
  })

  it('should only allow the contract fundraiser to allocate tokens', async () => {
    const token = await newToken()
    try {
      await token.allocateToEarlyContributor(ec1, 10000e+18, { from: ec1 })
    } catch (err) {
      utils.ensuresException(err)
    }
    assert.equal((await token.balanceOf.call(0)).toNumber(), 62500000e+18)
    assert.equal((await token.balanceOf.call(ec1)).toNumber(), 0)
  })

  it('should have no inflatable tokens before the crowdsale ends', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    const num = await token.numOfInflatableTokens()
    assert.equal(num.toNumber(), 0)
  })

  it('should be inflated 2.5% from initial token supply when a year passes', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    const currentBlockTimestamp = utils.getBlockNow() // base timestamp off the blockchain

    await cs.endCrowdsale(currentBlockTimestamp - 86400 * (365 + 1)) // a year ago (a year = 365.25d)

    const num = await token.numOfInflatableTokens()
    assert.equal(num.toString(), '2.5e+25')  // 2.5%
  })

  it('should be inflated 5.0625% of initial token supply when two years pass', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    const currentBlockTimestamp = utils.getBlockNow() // base timestamp off the blockchain
    await cs.endCrowdsale(currentBlockTimestamp - 86400 * (365 * 2 + 1)) // two year ago (a year = 365.25d)

    const num = await token.numOfInflatableTokens()
    assert.equal(num.toString(), '5.0625e+25')  // 5.0625%
  })

  it('should be inflated but less than 5.0625% of initial token supply when a year and 365 days passed', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    const currentBlockTimestamp = utils.getBlockNow() // base timestamp off the blockchain
    await cs.endCrowdsale(currentBlockTimestamp - 86400 * (365 * 2)) // less than two years (a year = 365.25d)

    const num = await token.numOfInflatableTokens()
    assert.equal(num.toString(), '5.0537303216974674880219028e+25')  // < 5.0625%
  })

  it('should be able to issue and allocate inflated tokens by time transition', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    const currentBlockTimestamp = utils.getBlockNow() // base timestamp off the blockchain
    await cs.endCrowdsale(currentBlockTimestamp - 86400 * (365 + 1)) // a year ago

    const num = await token.numOfInflatableTokens()
    assert.equal(num.toString(), '2.5e+25')  // 2.5%

    try {
      await token.issueTokens('0x0', 1)  // cannot issue tokens to an empty address
      assert.fail()
    } catch (err) {
      utils.ensuresException(err)
    }

    await token.issueTokens(founder1, web3.toBigNumber('1e+25'))
    await token.issueTokens(founder1, web3.toBigNumber('1.5e+25'))
    assert.equal((await token.balanceOf.call(founder1)).toString(), '2.5e+25')

    try {
      await token.issueTokens(founder1, 1)  // cannot issue tokens more than its limit
      assert.fail()
    } catch (err) {
      utils.ensuresException(err)
    }
    assert.equal((await token.balanceOf.call(founder1)).toString(), '2.5e+25')
  })

  it("should lock up company's tokens initially", async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    await cs.endCrowdsale(utils.getBlockNow())

    const transferableTokens =
      await token.numOfTransferableCompanysTokens.call()
    assert.equal(transferableTokens.toNumber(), 0)

    try {
      await token.transfer(ec1, 100e+18, { from: company })
    } catch (err) {
      utils.ensuresException(err)
    }

    const balance =  await token.balanceOf.call(company)
    assert.equal(balance.toNumber(), 750000000e+18) // no trasfered tokens
  })

  describe('setting up token contract', () => {
      it('lets fundraiser to change crowdsale and marketing contracts which are connected to token', async () => {
          const token = await newToken(crowdsale, mkgCampaign)
          const previousCSAddress = crowdsale.address
          const cs = await newCrowdsale()
          const newCSAddress = cs.address
          assert.equal(await token.starbaseCrowdsale(), previousCSAddress)

          const previousMkgCampaignAddress = mkgCampaign.address
          const newMkgCampaign = await StarbaseMarketingCampaign.new()
          const newMkgCampaignAddress = newMkgCampaign.address
          assert.equal(await token.starbaseMarketingCampaign(), previousMkgCampaignAddress)

          await token.setup(newCSAddress, newMkgCampaignAddress)

          assert.equal(await token.starbaseCrowdsale(), newCSAddress)
          assert.equal(await token.starbaseMarketingCampaign(), newMkgCampaignAddress)

          assert.equal((await token.balanceOf.call(previousCSAddress)).toNumber(), 0)
          assert.equal((await token.balanceOf.call(newCSAddress)).toNumber(), 175000000e+18)
          assert.equal((await token.balanceOf.call(previousMkgCampaignAddress)).toNumber(), 0)
          assert.equal((await token.balanceOf.call(newMkgCampaignAddress)).toNumber(), 12500000e+18)
      })

      it('does NOT a non-fundraiser to change crowdsale and marketing contracts which are connected to token', async () => {
          const token = await newToken(crowdsale, mkgCampaign)
          const previousCSAddress = crowdsale.address
          const cs = await newCrowdsale()
          const newCSAddress = cs.address
          assert.equal(await token.starbaseCrowdsale(), previousCSAddress)

          const previousMkgCampaignAddress = mkgCampaign.address
          const newMkgCampaign = await StarbaseMarketingCampaign.new()
          const newMkgCampaignAddress = newMkgCampaign.address
          assert.equal(await token.starbaseMarketingCampaign(), previousMkgCampaignAddress)

          try {
              await token.setup.sendTransaction(newCSAddress, newMkgCampaignAddress, { from: ep1 } )
              assert.fail()
          } catch(e) {
              utils.ensuresException(e)
          }

          assert.equal(await token.starbaseCrowdsale(), previousCSAddress)
          assert.equal(await token.starbaseMarketingCampaign(), previousMkgCampaignAddress)

          assert.equal((await token.balanceOf.call(previousCSAddress)).toNumber(), 175000000e+18)
          assert.equal((await token.balanceOf.call(newCSAddress)).toNumber(), 0)
          assert.equal((await token.balanceOf.call(previousMkgCampaignAddress)).toNumber(), 12500000e+18)
          assert.equal((await token.balanceOf.call(newMkgCampaignAddress)).toNumber(), 0)
      })

      it('does NOT allow to change the addresses of crowdsale and marketing contracts after the crowdsale started', async () => {
          const previousCS = await newCrowdsale()
          const token = await newToken(previousCS, mkgCampaign)
          const newCS = await newCrowdsale()
          assert.equal(await token.starbaseCrowdsale(), previousCS.address)

          const previousMkgCampaignAddress = mkgCampaign.address
          const newMkgCampaign = await StarbaseMarketingCampaign.new()
          assert.equal(await token.starbaseMarketingCampaign(), previousMkgCampaignAddress)

          await previousCS.ownerStartsCrowdsale(utils.getBlockNow())
          try {
              await token.setup.sendTransaction(newCS.address, newMkgCampaign.address)
              assert.fail()
          } catch(e) {
              utils.ensuresException(e)
          }

          assert.equal(await token.starbaseCrowdsale(), previousCS.address)
          assert.equal(await token.starbaseMarketingCampaign(), previousMkgCampaignAddress)

          assert.equal((await token.balanceOf.call(previousCS.address)).toNumber(), 175000000e+18)
          assert.equal((await token.balanceOf.call(newCS.address)).toNumber(), 0)
          assert.equal((await token.balanceOf.call(previousMkgCampaignAddress)).toNumber(), 12500000e+18)
          assert.equal((await token.balanceOf.call(newMkgCampaign.address)).toNumber(), 0)
      })
  })

  describe('Public Offering Plan', () => {
    // function alias
    const now = () => utils.getBlockNow()

    it('should not be able to declare a public offering with an untransferable period less than 2 months', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6), { mine: true }) // wait 6 months

      const unlockCompanysTokensAt = now() + secsInMonths(2) - 5  // less than 2 months
      try {
        await token.declarePublicOfferingPlan(1000e+18, unlockCompanysTokensAt)
      } catch (err) {
        utils.ensuresException(err)
      }

      assert.equal((await token.numOfDeclaredPublicOfferingPlans.call()).toNumber(), 0)
    })

    it('should not be able to declare a public offering plan for 6 months after the crowdsale ended', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6) - 5, { mine: true })  // wait less than 6 months

      const unlockCompanysTokensAt = now() + secsInMonths(2) + 5  // more than 2 months
      try {
        await token.declarePublicOfferingPlan(1000e+18, unlockCompanysTokensAt)
      } catch (err) {
        utils.ensuresException(err)
      }

      assert.equal((await token.numOfDeclaredPublicOfferingPlans.call()).toNumber(), 0)
    })

    it('should not be able to declare another public offering plan for 6 months', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6), { mine: true }) // wait 6 months

      const unlockCompanysTokensAt = now() + secsInMonths(2) + 5  // 6 months + more than 2 months
      await token.declarePublicOfferingPlan(1000e+18, unlockCompanysTokensAt)
      await timer(secsInMonths(6) - 5, { mine: true }) // wait less than 6 months

      try {
        await token.declarePublicOfferingPlan(500e+18, now() + secsInMonths(2) + 5)
      } catch (err) {
        utils.ensuresException(err)
      }

      assert.equal((await token.numOfDeclaredPublicOfferingPlans.call()).toNumber(), 1)
    })

    it('should be able to declare public offering plans', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6), { mine: true }) // wait 6 months

      const watcher = token.PublicOfferingPlanDeclared()
      const unlockCompanysTokensAt1 = now() + secsInMonths(2) + 5 // wait more than 6 months
      await token.declarePublicOfferingPlan(1000e+18, unlockCompanysTokensAt1)

      assert.equal((await token.numOfDeclaredPublicOfferingPlans.call()).toNumber(), 1)
      const plan1 = await token.publicOfferingPlans.call(0)
      assert.equal(plan1[0].toNumber(), 1000e+18)
      assert.equal(plan1[1].toNumber(), unlockCompanysTokensAt1)
      assert(utils.getBlockNow() - plan1[2].toNumber() <= 5) // declared just now

      const events1 = watcher.get()
      assert.equal(events1.length, 1)
      assert.equal(events1[0].args.tokenCount, 1000e+18)
      assert.equal(events1[0].args.unlockCompanysTokensAt, unlockCompanysTokensAt1)

      await timer(secsInMonths(6), { mine: true }) // wait 6 months for the 2nd declaration

      const unlockCompanysTokensAt2 = now() + secsInMonths(2) + 5
      await token.declarePublicOfferingPlan(500e+18, unlockCompanysTokensAt2)

      assert.equal((await token.numOfDeclaredPublicOfferingPlans.call()).toNumber(), 2)
      const plan2 = await token.publicOfferingPlans.call(1)
      assert.equal(plan2[0].toNumber(), 500e+18)
      assert.equal(plan2[1].toNumber(), unlockCompanysTokensAt2)
      assert(utils.getBlockNow() - plan2[2].toNumber() <= 5) // declared just now

      const events2 = watcher.get()
      assert.equal(events2.length, 1)
      assert.equal(events2[0].args.tokenCount, 500e+18)
      assert.equal(events2[0].args.unlockCompanysTokensAt, unlockCompanysTokensAt2)
    })

    it('should be able to transfer tokens according to a public offering plan', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6), { mine: true }) // wait 6 months

      // 1st declaration
      await token.declarePublicOfferingPlan(1000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(2) + 5, { mine: true }) // leap the time to unlock the tokens

      const transferableTokens =
        await token.numOfTransferableCompanysTokens.call()
      assert.equal(transferableTokens.toNumber(), 1000e+18)

      await token.transfer(ec1, 1000e+18, { from: company })
      assert.equal((await token.balanceOf.call(company)).toNumber(), 749999000e+18)
      assert.equal((await token.balanceOf.call(ec1)).toNumber(), 1000e+18)

      // cannot transfer tokens over the declaration
      try {
        await token.transfer(ec1, 1, { from: company })
      } catch (err) {
        utils.ensuresException(err)
      }
      assert.equal((await token.balanceOf.call(company)).toNumber(), 749999000e+18)
      assert.equal((await token.balanceOf.call(ec1)).toNumber(), 1000e+18)

      await timer(secsInMonths(6), { mine: true })  // leap the time to declare the 2nd PO

      // 2nd declaration
      await token.declarePublicOfferingPlan(2000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(2) + 5, { mine: true })
      assert.equal((await token.numOfTransferableCompanysTokens.call()).toNumber(), 2000e+18)

      await timer(secsInMonths(6), { mine: true })  // leap the time to declare the 3rd PO

      // 3rd declaration
      await token.declarePublicOfferingPlan(3000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(2) + 5, { mine: true })
      assert.equal((await token.numOfTransferableCompanysTokens.call()).toNumber(), 5000e+18)
    })

    it('should not declare a public offering plan exceeds 100M tokens', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6), { mine: true }) // wait 6 months

      try {
        await token.declarePublicOfferingPlan(100000001e+18, now() + secsInMonths(2) + 5)
      } catch (err) {
        utils.ensuresException(err)
      }
      assert.equal((await token.numOfTransferableCompanysTokens.call()).toNumber(), 0)
    })

    it('should not declare public offering plans totally exceed the initial token allocation(750M tokens)', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await cs.endCrowdsale(now())
      await timer(secsInMonths(6), { mine: true }) // wait 6 months

      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })  // leap to declare another PO
      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })
      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })
      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })
      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })
      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })
      await token.declarePublicOfferingPlan(100000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(6), { mine: true })
      await token.declarePublicOfferingPlan(50000000e+18, now() + secsInMonths(2) + 5)
      await timer(secsInMonths(2) + 5, { mine: true })  // leap to unlock the tokens
      assert.equal((await token.numOfTransferableCompanysTokens.call()).toNumber(), 750000000e+18)

      try {
        await token.declarePublicOfferingPlan(1, now() + secsInMonths(6) + 5)
      } catch (err) {
        utils.ensuresException(err)
      }
      assert.equal((await token.numOfTransferableCompanysTokens.call()).toString(), '7.5e+26')
    })
  })

  it('should not allow to transfer tokens purchased on the crowdsale for a week from the end of it', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.loadEarlyPurchases()
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: cs1, value: 1e+18 })

    const now = utils.getBlockNow() // base timestamp off the blockchain
    await cs.endCrowdsale(now - (86400 * 7) + 10) // less than 7 days ago

    assert.equal((await token.balanceOf(cs1)).toNumber(), 0)
    assert.equal(await token.isTransferable(cs1, 1), false)

    await cs.withdrawPurchasedTokens({ from: cs1 })
    assert.equal((await token.balanceOf(cs.address)).toNumber(), 5e+25)
    assert.equal((await token.balanceOf(cs1)).toNumber(), 1.25e+26)
    assert.equal(await token.isTransferable(cs1, 1), false) // should be locked up
  })

  it('should allow to transfer tokens purchased on the crowdsale after a week from the end of it', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.loadEarlyPurchases()
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: cs1, value: 1e+18 })

    const now = utils.getBlockNow() // base timestamp off the blockchain
    await cs.endCrowdsale(now - (86400 * 7))  // 7 days ago

    await cs.withdrawPurchasedTokens({ from: cs1 })
    assert.equal((await token.balanceOf(cs.address)).toNumber(), 5e+25)
    assert.equal((await token.balanceOf(cs1)).toNumber(), 1.25e+26)
    assert.equal(await token.isTransferable(cs1, 1), true)  // should be unlocked
  })

  it('should not allow to transfer early purchased tokens for two weeks from the end of the crowdsale', async () => {
    const now = utils.getBlockNow()
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 100, now)
    await ep.closeEarlyPurchase()
    const epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    const cs = await newCrowdsale()
    const token = await newToken(cs)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.loadEarlyPurchases()
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: ep1, value: 1e+18 })
    await cs.purchaseWithEth({ from: cs1, value: 1e+18 })
    await cs.endCrowdsale(utils.getBlockNow() - (86400 * 14) + 10)  // less than 14 days ago

    await cs.withdrawPurchasedTokens({ from: cs1 })
    await cs.withdrawPurchasedTokens({ from: ep1 })
    assert.equal((await token.balanceOf(ep1)).toNumber(), 6.25e+25)
    assert.equal((await token.balanceOf(cs1)).toNumber(), 6.25e+25)

    // should allow to transfer tokens purchased on the CS
    await token.transfer(cs1, 1e+18, { from: ep1 })
    assert.equal((await token.balanceOf(ep1)).toNumber(),  6.2499999e+25) // - 1 from transfer
    assert.equal((await token.balanceOf(cs1)).toNumber(),  6.2500001e+25)

    // should not allow to transfer tokens that are early purchased
    try {
      await token.transfer(cs1, 1, { from: ep1 })
    } catch (e) {
      utils.ensuresException(e)
    }
    assert.equal((await token.balanceOf(ep1)).toNumber(),  6.2499999e+25) // remains the same
  })

  it('should allow to transfer early purchased tokens two weeks after end of the crowdsale', async () => {
    const now = utils.getBlockNow()
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(ep1, 100, now)
    await ep.closeEarlyPurchase()
    const epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    const cs = await newCrowdsale()
    const token = await newToken(cs)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.loadEarlyPurchases()
    await timer(2) // wait a couple of secs
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: ep1, value: 1e+18 })
    await cs.purchaseWithEth({ from: cs1, value: 1e+18 })
    await cs.endCrowdsale(utils.getBlockNow() - (86400 * 14))  // 14 days ago

    await cs.withdrawPurchasedTokens({ from: cs1 })
    await cs.withdrawPurchasedTokens({ from: ep1 })
    assert.equal((await token.balanceOf(ep1)).toNumber(), 6.25e+25)
    assert.equal((await token.balanceOf(cs1)).toNumber(), 6.25e+25)

    // should allow to transfer unlocked tokens for early purchasers
    await token.transfer(cs1, 1e+18, { from: ep1 })
    assert.equal((await token.balanceOf(ep1)).toNumber(),  6.2499999e+25)
    assert.equal((await token.balanceOf(cs1)).toNumber(), 6.2500001e+25)
  })

  it('should be able to declare Starbase MVP has been launched', async () => {
    const cs = await newCrowdsale()
    const token = await newToken(cs)
    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.loadEarlyPurchases()
    await cs.endCrowdsale(3 * 30 * 86400)  // 3 months ago
    await cs.withdrawPurchasedTokens()

    assert.equal((await token.mvpLaunchedAt()).toNumber(), 0)

    const now = utils.getBlockNow()
    const watcher = token.MvpLaunched()
    await token.declareMvpLaunched(now)
    assert.equal((await token.mvpLaunchedAt()).toNumber(), now)

    const events = watcher.get()
    assert.equal(events.length, 1)
    assert.equal(events[0].args.launchedAt, now)
  })

  describe('for early contributors', () => {
    it('should not allow early contributors to transfer their tokens initially', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      await token.allocateToEarlyContributor(ec1, 100e+18)
      assert.equal((await token.initialEcTokenAllocation(ec1)).toNumber(), 100e+18)

      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: ec1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow() - 7 * 86400)  // a week ago

      await cs.withdrawPurchasedTokens({ from: ec1 })
      assert.equal((await token.balanceOf(ec1)).toNumber(), 1.250001e+26)
      assert.equal((await token.balanceOf(someone)).toNumber(), 0)
      assert.equal((await token.numOfUntransferableEcTokens(ec1)).toNumber(), 100e+18)

      await token.transfer(someone, 1e+18, { from: ec1 }) // tokens purchased on the crowdsale
      assert.equal((await token.balanceOf(ec1)).toNumber(), 1.25000099e+26)
      assert.equal((await token.balanceOf(someone)).toNumber(), 1e+18)

      try {
        await token.transfer(someone, 1, { from: ec1 })
      } catch (err) {
        utils.ensuresException(err)
      }
      assert.equal((await token.balanceOf(someone)).toNumber(), 1e+18)
    })

    it('should allow early contributors to transfer their tokens after a certain while', async () => {
      const now = utils.getBlockNow()
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      token.allocateToEarlyContributor(ec1, 5200e+18)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await cs.endCrowdsale(now - 365 * 1.5 * 86400)  // a year and half ago
      await cs.withdrawPurchasedTokens()
      assert.equal((await token.balanceOf(ec1)).toNumber(), 5200e+18)
      assert.equal((await token.balanceOf(someone)).toNumber(), 0)

      await token.declareMvpLaunched(now - (365 + 14) * 86400)  // a year and two weeks ago
      assert.equal((await token.numOfUntransferableEcTokens(ec1)).toNumber(), 5000e+18) // = 5200 - (5200 / 52 * 2)

      await token.transfer(someone, 200e+18, { from: ec1 })
      assert.equal((await token.balanceOf(ec1)).toNumber(), 5000e+18)
      assert.equal((await token.balanceOf(someone)).toNumber(), 200e+18)

      try {
        await token.transfer(someone, 1, { from: ec1 })
      } catch (err) {
        utils.ensuresException(err)
      }
      assert.equal((await token.balanceOf(ec1)).toNumber(), 5000e+18)
      assert.equal((await token.balanceOf(someone)).toNumber(), 200e+18)
    })

    it('should allow early contributors to transfer their all tokens two years later from the MVP launch date', async () => {
      const now = utils.getBlockNow()
      const cs = await newCrowdsale()
      const token = await newToken(cs)
      token.allocateToEarlyContributor(ec1, 5200e+18)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await cs.endCrowdsale(now - 365 * 2.5 * 86400)  // two years and half ago
      await cs.withdrawPurchasedTokens()
      assert.equal((await token.balanceOf(ec1)).toNumber(), 5200e+18)
      assert.equal((await token.balanceOf(someone)).toNumber(), 0)

      await token.declareMvpLaunched(now - (365 * 2 + 14) * 86400)  // two years and two weeks ago
      assert.equal((await token.numOfUntransferableEcTokens(ec1)).toNumber(), 0)

      await token.transfer(someone, 5200e+18, { from: ec1 })
      assert.equal((await token.balanceOf(ec1)).toNumber(), 0)
      assert.equal((await token.balanceOf(someone)).toNumber(), 5200e+18)
    })
  })

  describe('Fundraisers', () => {
    let cs
    let token
    beforeEach('setup', async () => {
      cs = await newCrowdsale()
      token = await newToken(cs)
    })

    it('sets first fundraiser', async () => {
      assert.isTrue(await token.isFundraiser(founder1))
    })

    it('checks that an address is NOT a fundraiser', async () => {
      assert.isFalse(await token.isFundraiser(someone))
    })

    it('checks that an address is a fundraiser', async () => {
      assert.isTrue(await token.isFundraiser(founder1))
    })

    it('does not allow a NON-fundraiser to add another fundraiser', async () => {
      assert.isFalse(await token.isFundraiser(someone))

      try {
        await token.addFundraiser.sendTransaction(company, { from: someone })
      } catch (e) {
        utils.ensuresException(e)
      }
    })

    it('does NOT permit fundraiser to add fundraiser as an empty address', async () => {
      assert.isFalse(await token.isFundraiser(company)) // address that is not a fundraiser

      try {
        await token.addFundraiser('0x0')
        assert.fail()
      } catch(e) {
        utils.ensuresException(e)
      }

      assert.isFalse(await token.isFundraiser(company))
    })

    it('allows a fundraiser to add another fundraiser', async () => {
      assert.isFalse(await token.isFundraiser(company)) // address that is not a fundraiser
      await token.addFundraiser(company)

      assert.isTrue(await token.isFundraiser(company))
    })

    it('logs event when a fundraiser is added', async () => {
      const txObject = await token.addFundraiser(company)

      assert.strictEqual(txObject.logs.length, 1)
      assert.strictEqual(txObject.logs[0].args.fundraiserAddress, company)
      assert.strictEqual(txObject.logs[0].args.isBonaFide, true)
    })

    it('does NOT let a NON-fundraiser to update fundraisers', async () => {
      assert.isFalse(await token.isFundraiser(someone))

      try {
        await token.updateFundraiser.sendTransaction(company, true, { from: someone })
      } catch (e) {
        utils.ensuresException(e)
      }
    })

    it('updates a fundraiser, for example revoking an address from fundraiser rights', async () => {
      await token.addFundraiser(someone)
      assert.isTrue(await token.isFundraiser(someone))

      await token.updateFundraiser(someone, false) // remove fundraiser status
      assert.isFalse(await token.isFundraiser(someone))
    })

    it('logs event when a fundraiser is updated', async () => {
      const txObject = await token.updateFundraiser(founder1, false)

      assert.strictEqual(txObject.logs.length, 1)
      assert.strictEqual(txObject.logs[0].args.fundraiserAddress, founder1)
      assert.strictEqual(txObject.logs[0].args.isBonaFide, false)
    })
  })
})
