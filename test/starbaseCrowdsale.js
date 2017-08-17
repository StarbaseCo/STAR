const timer = require('./helpers/timer')
const utils = require('./helpers/utils')

const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')

contract('StarbaseCrowdsale', accounts => {

  it("should have at least 6 accounts", () => {
    assert.isAtLeast(accounts.length, 6)
  })

  const founder1 = accounts[0]
  const purchaser1 = accounts[1]
  const purchaser2 = accounts[2]
  const company = accounts[3]
  const csWorkshop = accounts[4]
  const mkgWorkshop = accounts[5]
  const totalAmountOfEP = 6000000;


  let mkgCampaign
  let cs
  let token
  let earlyPurchaseAmendment
  let startDate
  let purchaseAt
  const secondsInADay = 86400

  const newCrowdsale = (customEpa) => {
    if (customEpa) {
      return StarbaseCrowdsale.new(csWorkshop, customEpa.address)
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
        return StarbaseCrowdsale.new(csWorkshop, epa.address)
      })
    }
  }

  const newToken = (crowdsaleAddr) => {
    return StarbaseToken.new(company, crowdsaleAddr, mkgCampaign.address)
  }

  before(() => {
    return StarbaseMarketingCampaign.deployed().then(x => mkgCampaign = x)
  })

  beforeEach('initialize crowdsale contract', async () => {
    cs = await newCrowdsale()
    token = await newToken(cs.address)
    await cs.setup(token.address, web3.eth.blockNumber)
  })

  it('should be able to be instantiated with a workshop address', async () => {
    assert.equal(await cs.workshop.call(), csWorkshop)
  })

  it('should be able to set an address of StarbaseToken contract', async () => {
    assert.equal(await cs.starbaseToken.call(), token.address)
  })

  it("logs StarBasePurchasedWithEth event", async () => {
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1 })
    const fortyfourDaysAsSeconds = secondsInADay * 44
    await timer(fortyfourDaysAsSeconds)
    const { logs } = await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.strictEqual(logs.length, 1, 'should have received 1 event')

    assert.strictEqual(logs[0].args.purchaser, purchaser1, "should be accounts[4] address")
    assert.strictEqual(logs[0].args.amount.toNumber(), 2000, "should be 200")
    assert.strictEqual(logs[0].args.cnyEthRate.toNumber(), 2000, "should be 200")
    assert.strictEqual(logs[0].args.bonusTokensPercentage.toNumber(), 0, "should be 0")
  })

  it('should NOT permit other addresses to set cny eth rate', async () => {
    try {
      await cs.updateCnyEthRate.sendTransaction(124, { from: purchaser1 })
    } catch (error) {
      utils.ensuresException(error)
    }

    assert.equal(await cs.cnyEthRate.call(), 0)
  })

  it('should allow contract owner to set cny eth rate', async () => {
    await cs.updateCnyEthRate(123)

    assert.equal(await cs.cnyEthRate.call(), 123, "the rate should be 123")
  })

  it("should receive CnyEthRateUpdated event", async () => {
    const { logs } = await cs.updateCnyEthRate(123)

    assert.strictEqual(logs.length, 1, 'should have received 1 event')

    assert.strictEqual(logs[0].args.cnyEthRate.toNumber(), 123, "should be 123")
  })

  it('should NOT permit other addresses to set cny btc rate', async () => {
    try {
      await cs.updateCnyEthRate.sendTransaction(124, { from: purchaser1 })
    } catch (error) {
      utils.ensuresException(error)
    }

    assert.equal(await cs.cnyEthRate.call(), 0)
  })

  it('should allow contract owner to set cny btc rate', async () => {
    await cs.updateCnyBtcRate(123)

    assert.equal(await cs.cnyBtcRate.call(), 123, "the rate should be 123")
  })

  it("should receive CnyBtcRateUpdated event", async () => {
    const { logs } = await cs.updateCnyBtcRate(123)

    assert.strictEqual(logs.length, 1, 'should have received 1 event')

    assert.strictEqual(logs[0].args.cnyBtcRate.toNumber(), 123, "should be 123")
  })

  describe('qualified Partner', () => {
    it("creates event upon setting qualified partner", async () => {
      const { logs } = await cs.setQualifiedPartner(purchaser1)

      assert.strictEqual(logs.length, 1, 'should have received 1 event')

      assert.strictEqual(logs[0].args.qualifiedPartner, purchaser1, "qualified partner is set")
    })

    describe('inability to purchase', () => {
      it('does NOT record purchase without a qualified partner set', async () => {
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase without ETH rate set', async () => {
        await cs.setQualifiedPartner(purchaser1)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase if an incorrect qualified partner', async () => {
        await cs.setQualifiedPartner(purchaser1)
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser2, value: 1e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase with a cap larger than 20 ether', async () => {
        await cs.setQualifiedPartner(purchaser1)
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 21e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })
    })

    describe('able to purchase', () => {
      it('acquires with 30 percentage bonus', async () => {
        await cs.setQualifiedPartner(purchaser1)
        await cs.updateCnyEthRate(2000)

        await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2600)

        const purchase = await cs.crowdsalePurchases(0)
        assert.equal(purchase[0].toString(), purchaser1)
        assert.equal(purchase[1].toNumber(), 2600)

        assert.equal(purchase[3].toString(), '')
        assert.equal(purchase[4].toNumber(), 30)
      })
    })
  })

  describe('starting crowdsale', () => {
    it('should not allow to start the crowdsale before the specified block number', async () => {
      const cs = await newCrowdsale()
      await cs.updateCnyEthRate(1000)

      // when the block number has not been set yet
      try {
        await cs.purchaseWithEth({ from: purchaser1, value: 1 })
        assert.fail()
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal((await cs.startDate()).toNumber(), 0)

      // when the block number is future one
      const startsAt = web3.eth.blockNumber + 3
      await cs.setup(token.address, startsAt)  // start at the 1st block number
      try {
        await cs.purchaseWithEth({ from: purchaser1, value: 1 })
        assert.fail()
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal((await cs.startDate()).toNumber(), 0)
    })

    it('should start the crowdsale automatically by the first purchase with Ether', async () => {
      const cs = await newCrowdsale()
      const startsAt = web3.eth.blockNumber + 2
      await cs.setup(token.address, startsAt)
      await cs.updateCnyEthRate(1000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1 })
      assert.isBelow(utils.getBlockNow() - (await cs.startDate()).toNumber(), 5) // started just now
    })

    it('should start the crowdsale automatically by the first purchase with Bitcoin', async () => {
      const cs = await newCrowdsale()
      const startsAt = web3.eth.blockNumber + 2
      await cs.setup(token.address, startsAt)
      await cs.updateCnyBtcRate(10000)
      await cs.recordOffchainPurchase(purchaser1, 1, Math.floor(Date.now() / 1000), 'btc:xxx')
      assert.isBelow(utils.getBlockNow() - (await cs.startDate()).toNumber(), 5) // started just now
    })
  })

  describe('unable to record offline purchases', () => {
    it('does NOT record off-chain if not sent by owner', async () => {
      startDate = await cs.startDate()
      purchaseAt = startDate.toNumber() + 2
      await timer(2)
      await cs.updateCnyBtcRate(2000)

      try {
        await cs.recordOffchainPurchase(
          purchaser1,
          2,
          1497532648,
          'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d',
          { from: purchaser1 }
        )
      } catch(error) {
        utils.ensuresException(error)
      }

      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
    })

    it('does NOT record off-chain purchases before crowdsale start date', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.updateCnyBtcRate(2000)
      await cs.setup(token.address, web3.eth.blockNumber + 3)

      try {
        await cs.recordOffchainPurchase(
          purchaser1,
          2,
          1497532648,
          'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d'
        )
      } catch(error) {
        utils.ensuresException(error)
      }

      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
    })

    it('does NOT record off-chain purchases if cny BTC rate is not set', async () => {
      startDate = await cs.startDate()
      purchaseAt = startDate.toNumber() + 2
      await timer(2)

      try {
        await cs.recordOffchainPurchase(
          purchaser1,
          2,
          purchaseAt,
          'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d'
        )
      } catch(error) {
        utils.ensuresException(error)
      }

      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
    })
  })

  describe('recording off chain purchases', () => {
    beforeEach(async () => {
      startDate = await cs.startDate()
      purchaseAt = startDate.toNumber() + 2
      await timer(2)

      await cs.updateCnyBtcRate(2000)
    })

    it('should be able to record off-chain purchases', async () => {
      await cs.recordOffchainPurchase(
        purchaser1,
        2,
        purchaseAt,
        'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d'
      )
      assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2)

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 2)
      assert(purchase[2].toNumber(), purchaseAt)
      assert.equal(
        purchase[3].toString(),
        'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d')
    })

    it("logs StarBasePurchasedOffChain event", async () => {
      const { logs } = await cs.recordOffchainPurchase(
        purchaser1,
        2,
        purchaseAt,
        'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d'
      )

      assert.strictEqual(logs.length, 1, 'should have received 1 event')

      assert.strictEqual(logs[0].args.purchaser, purchaser1, "should be accounts[4] address")
      assert.strictEqual(logs[0].args.amount.toNumber(), 2, "should be 2")
      assert.strictEqual(logs[0].args.cnyBtcRate.toNumber(), 2000, "should be 2000")
      assert.strictEqual(logs[0].args.bonusTokensPercentage.toNumber(), 20, "should be 20")
      assert.strictEqual(logs[0].args.data, 'btc:1732c342c93f69bb63b62960c422564d9b6e6f47f077d5498f0087e2bb2c256d')
    })
  })

  describe('ending crowdsale', () => {
    it('returns false if crowdsale is still going on ', async () => {
      await timer(2)
      assert.isFalse(await cs.isEnded())
    })

    it('returns true if crowdsale has ended', async () => {
      const now = utils.getBlockNow() // base timestamp off the blockchain
      await cs.endCrowdsale(now)

      assert.isTrue(await cs.isEnded())
    })

    it('errors with a time higher than now', async () => {
      const now = utils.getBlockNow() // base timestamp off the blockchain

      try {
        await cs.endCrowdsale(now + 2)
      } catch(error) {
        utils.ensuresException(error)
      }
    })

    it('should be able to end the crowdsale with an event', async () => {
      const now = utils.getBlockNow() // base timestamp off the blockchain
      const watcher = cs.CrowdsaleEnded();  // event watcher
      await cs.endCrowdsale(now)
      assert.equal((await cs.endedAt()).toNumber(), now)

      const events = watcher.get()
      assert.equal(events.length, 1)
      assert.equal(events[0].args.endedAt, now)
    })
  })

  describe('delivery of tokens', () => {
    it('returns the number of purchased tokens by a purchaser upon delivery', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.loadEarlyPurchases()
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())
      assert.equal((await cs.numOfPurchasedTokensOnCsBy.call(purchaser1)).toNumber(), 0)

      await cs.deliverPurchasedTokens()
      assert.equal((await cs.numOfPurchasedTokensOnCsBy.call(purchaser1)).toNumber(), 1.25e+26) // total tokens including 20% bonus
      assert.equal((await cs.numOfPurchasedTokensOnCsBy.call(purchaser2)).toNumber(), 0)
    })

    it('keeps track of the number of delivered crowdsale purchase', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      await cs.purchaseWithEth({ from: accounts[6], value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())

      const estimatedGas = await cs.deliverPurchasedTokens.estimateGas()
      await cs.deliverPurchasedTokens.sendTransaction({ gas: estimatedGas})
      assert.equal((await cs.numOfDeliveredCrowdsalePurchases.call()).toNumber(), 1) // index of crowdsalePurchases when gas ran out.
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by purchaser1 first time') // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 0, 'Number of tokens by purchaser2 first time') // total tokens including 20%
      assert.equal((await token.balanceOf(accounts[6])).toNumber(), 0, 'Number of tokens by accounts[6] first time') // total tokens including 20%

      await cs.deliverPurchasedTokens() // continues token delivery from index it was left off from
      assert.equal((await cs.numOfDeliveredCrowdsalePurchases.call()).toNumber(), 3)
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by purchaser1 second time') // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by purchaser2 second time') // total tokens including 20%
      assert.equal((await token.balanceOf(accounts[6])).toNumber(), 4.1666666666666664e+25, 'Number of tokens by accounts[6] second time') // total tokens including 20%
    })

    it('should be able to load early puchases from StarbaseEarlyPurchaseAmendment contract with 20% bonus', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser1, 100, now)
      await ep.appendEarlyPurchase(purchaser2, 50, now)
      await ep.appendEarlyPurchase(purchaser1, 200, now)
      await ep.appendEarlyPurchase(purchaser1, 300, now)
      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)
      await epa.invalidateEarlyPurchase(0)
      await epa.amendEarlyPurchase(2, purchaser1, 150, now)

      const cs = await newCrowdsale(epa)
      await cs.loadEarlyPurchases()
      assert.equal((await cs.earlyPurchasedAmountBy(purchaser1)).toNumber(), 540) // 450 + 90 (20% bonus)
      assert.equal((await cs.earlyPurchasedAmountBy(purchaser2)).toNumber(), 60) // 50 + 10 (20% bonus)
      assert.equal((await cs.earlyPurchasedAmountBy(founder1)).toNumber(), 0)
    })

    it('should be able to deliver STARs to early purchasers after the crowdsale', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser1, 2, now)
      await ep.appendEarlyPurchase(purchaser2, 1, now)
      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)

      const cs = await newCrowdsale(epa)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.deliverPurchasedTokens()
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 158281315.02288805e+18) // purchase during crowdsale + early purchases.
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 16718684.977111944e+18)
    })

    it('keeps track of the number of delivered early purchases', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser1, 2, now)
      await ep.appendEarlyPurchase(purchaser2, 1, now)
      await ep.appendEarlyPurchase(founder1, 1, now)
      await ep.appendEarlyPurchase(accounts[6], 1, now)

      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)

      const cs = await newCrowdsale(epa)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await timer(2) // wait a couple of secs
      await cs.endCrowdsale(utils.getBlockNow())

      const estimatedGas = await cs.deliverPurchasedTokens.estimateGas()
      await cs.deliverPurchasedTokens.sendTransaction({ gas: estimatedGas })
      assert.equal((await cs.numOfDeliveredEarlyPurchases.call()).toNumber(), 3)

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 7e+25, 'Number of delivered tokens for purchaser1 first time entering the deliverPurchasedTokens') // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 3.5e+25, 'Number of delivered tokens for purchaser2 first time entering the deliverPurchasedTokens') // total tokens including 20%
      assert.equal((await token.balanceOf(founder1)).toNumber(), 3.5e+25, 'Number of delivered tokens for founder1 first time entering the deliverPurchasedTokens')
      assert.equal((await token.balanceOf(accounts[6])).toNumber(), 0, 'Number of delivered tokens for accounts[6] first time entering the deliverPurchasedTokens')

      await cs.deliverPurchasedTokens() // continues token delivery from index it was left off from
      assert.equal((await cs.numOfDeliveredEarlyPurchases.call()).toNumber(), 4)

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 7e+25, 'Number of delivered tokens for purchaser1 second time entering the deliverPurchasedTokens', 'Number of delivered tokens for purchaser2 second time entering the deliverPurchasedTokens')
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 3.5e+25, 'Number of delivered tokens for founder1 second time entering the deliverPurchasedTokens')
      assert.equal((await token.balanceOf(founder1)).toNumber(), 3.5e+25, 'Number of delivered tokens for accounts[6] second time entering the deliverPurchasedTokens')
      assert.equal((await token.balanceOf(accounts[6])).toNumber(), 3.5e+25, 'Number of delivered tokens for accounts[6]')
    })
  })

  describe('#withdrawForCompany', () => {
    it('fails if there is no fundraiser address set', async () => {
      try {
        await cs.withdrawForCompany()
      } catch (error) {
        utils.ensuresException(error)
      }
    })

    it('fails if balance is no balance', async () => {
      const balanceBefore = web3.eth.getBalance(cs.address)

      try {
        await cs.withdrawForCompany()
      } catch (error) {
        utils.ensuresException(error)
      }

      const balanceAfter = web3.eth.getBalance(cs.address)

      assert.equal(balanceBefore.toNumber(), balanceAfter.toNumber())
    })

    it('fails if company adress is not set', async () => {
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      try {
        await cs.withdrawForCompany()
      } catch (error) {
        utils.ensuresException(error)
      }
    })

    it('transfers contract balance', async () => {
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const balanceBefore = web3.eth.getBalance(cs.address)

      await cs.withdrawForCompany()

      const balanceAfter = web3.eth.getBalance(cs.address)

      assert.isBelow(balanceAfter.toNumber(), balanceBefore.toNumber())
      assert.equal(balanceAfter.toNumber(), 0)
    })


    it('tranfers contract funds to company', async () => {
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const companyBalanceBefore = web3.eth.getBalance(company)

      await cs.withdrawForCompany()

      const companyBalanceAfter = web3.eth.getBalance(company)

      assert.isAbove(companyBalanceAfter.toNumber(), companyBalanceBefore.toNumber())
    })
  })

  describe('Emergency calls execution', () => {
    it('fails if balance is no balance', async () => {
      const balanceBeforeEmergencyCall = web3.eth.getBalance(cs.address)

      try {
        await cs.executeEmergencyCall()
      } catch (error) {
        utils.ensuresException(error)
      }

      const balanceAfterEmergencyCall = web3.eth.getBalance(cs.address)

      assert.equal(balanceBeforeEmergencyCall.toNumber(), balanceAfterEmergencyCall.toNumber())
    })

    it('transfers if there is balance', async () => {
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const balanceBeforeEmergencyCall = web3.eth.getBalance(cs.address)

      await cs.executeEmergencyCall()

      const balanceAfterEmergencyCall = web3.eth.getBalance(cs.address)

      assert.isBelow(balanceAfterEmergencyCall.toNumber(), balanceBeforeEmergencyCall.toNumber())
      assert.equal(balanceAfterEmergencyCall.toNumber(), 0)
    })

    it('must not be invoked if called by NOT the owner', async () => {
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const balanceBeforeEmergencyCall = web3.eth.getBalance(cs.address)

      try {
        await cs.executeEmergencyCall.sendTransaction({ from: purchaser1})
      } catch (error) {
        utils.ensuresException(error)
      }

      const balanceAfterEmergencyCall = web3.eth.getBalance(cs.address)

      assert.equal(balanceBeforeEmergencyCall.toNumber(), balanceAfterEmergencyCall.toNumber())
    })

    it('is invoked by owner who receives contract funds', async () => {
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const ownerBalanceBeforeEmergencyCall = web3.eth.getBalance(founder1)

      await cs.executeEmergencyCall()

      const ownerBalanceAfterEmergencyCall = web3.eth.getBalance(founder1)

      assert.isAbove(ownerBalanceAfterEmergencyCall.toNumber(),ownerBalanceBeforeEmergencyCall.toNumber())
    })
  })

  describe('Acquisition of Star tokens via sending Ether to StarbaseCrowdsale contract', () => {
    it('allows purchases to acquire Star tokens', async () => {
      const startDate = await cs.startDate()
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(1000)
      await cs.sendTransaction({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 1200)
      assert.equal(
        (await cs.totalRaisedAmountInCny()).toNumber(), 1200
      )

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 1200)

      assert.isAtLeast(purchase[2].toNumber(), startDate)

      assert.equal(purchase[3].toString(), '')
      assert.equal(purchase[4].toNumber(), 20) // 20 percent bonus
    })
  })

  describe('#invalidatePurchase', () => {
    it('should be able to invalidate crowdsale purchases after the sale ends', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2)  // wait a couple of secs
      await cs.updateCnyEthRate(1000)

      await cs.purchaseWithEth({ from: purchaser1, value: 25e+15 })
      await cs.purchaseWithEth({ from: purchaser2, value: 50e+15 })
      await cs.purchaseWithEth({ from: purchaser1, value: 100e+15 })
      await cs.purchaseWithEth({ from: purchaser1, value: 50e+15 })
      await cs.purchaseWithEth({ from: purchaser1, value: 10e+15 })
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.invalidatePurchase(2)
      await cs.invalidatePurchase(4)
      await cs.deliverPurchasedTokens()

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 75e+24) // 75/125 STAR
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 50e+24) // 50/125 STAR
    })

    it('should not work once the tokens are delivered', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2)  // wait a couple of secs
      await cs.updateCnyEthRate(1000)

      await cs.purchaseWithEth({ from: purchaser1, value: 75e+15 })
      await cs.purchaseWithEth({ from: purchaser2, value: 50e+15 })
      await cs.endCrowdsale(utils.getBlockNow())

      assert.equal((await cs.crowdsalePurchases(0))[1].toNumber(), 90)
      await cs.deliverPurchasedTokens()
      try{
        await cs.invalidatePurchase(0)
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal((await cs.crowdsalePurchases(0))[1].toNumber(), 90)
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 75e+24) // 75/125 STAR
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 50e+24) // 50/125 STAR
    })
  })

  describe('#amendPurchase', () => {
    it('should be able to amend crowdsale purchases after the sale ends', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2)  // wait a couple of secs
      await cs.updateCnyEthRate(1000)

      await cs.purchaseWithEth({ from: purchaser1, value: 25e+15 })
      await cs.purchaseWithEth({ from: purchaser1, value: 25e+15 })
      await cs.purchaseWithEth({ from: purchaser1, value: 100e+15 })
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.amendPurchase(1, purchaser2, 60, utils.getBlockNow(), '', 20)
      await cs.amendPurchase(2, purchaser1, 60, utils.getBlockNow(), '', 20)
      await cs.deliverPurchasedTokens()

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 75e+24) // 75/125 STAR
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 50e+24) // 50/125 STAR
    })

    it('should not work once the tokens are delivered', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2)  // wait a couple of secs
      await cs.updateCnyEthRate(1000)

      await cs.purchaseWithEth({ from: purchaser1, value: 75e+15 })
      await cs.purchaseWithEth({ from: purchaser2, value: 50e+15 })
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.deliverPurchasedTokens()
      try{
        await cs.amendPurchase(0, purchaser2, 60, utils.getBlockNow(), '', 20)
      } catch (error) {
        utils.ensuresException(error)
      }

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 75e+24) // 75/125 STAR
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 50e+24) // 50/125 STAR
    })
  })

  describe('crowdsale finishes automatically', () => {
    beforeEach('set up', async () => {
      await cs.updateCnyEthRate(60000000)
    })

    it('halts crowdsale purchases when the cap reaches over 66M CNY', async () => {
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      try {
        await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      } catch (error) {
        utils.ensuresException(error)
      }
    })

    it('returns the difference in purchase when a purchase goes over the max cap', async () => {
      const purchase1Balance = await web3.eth.getBalance(purchaser1)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 60000000)

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 60000000)

      // Should have the difference back. Purchased with 1 eth so the balance post purchase should be approximate to the pre purchase balance give or take 1eth.
      assert.approximately(await web3.eth.getBalance(purchaser1).toNumber(), purchase1Balance.toNumber(), 1e+18)
    })
  })
})
