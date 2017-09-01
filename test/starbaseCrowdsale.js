const timer = require('./helpers/timer')
const utils = require('./helpers/utils')

const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')

contract('StarbaseCrowdsale', accounts => {

  const founder1 = accounts[0]
  const purchaser1 = accounts[1]
  const purchaser2 = accounts[2]
  const company = accounts[3]
  const csWorkshop = accounts[4]
  const mkgWorkshop = accounts[5]
  const addressA = accounts[6]
  const addressB = accounts[7]
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
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    const fortyfourDaysAsSeconds = secondsInADay * 44
    await timer(fortyfourDaysAsSeconds)
    const { logs } = await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.strictEqual(logs.length, 1, 'should have received 1 event')

    assert.strictEqual(logs[0].args.purchaser, purchaser1, "should be accounts[4] address")
    assert.strictEqual(logs[0].args.amount.toNumber(), 2000, "should be 200")
    assert.strictEqual(logs[0].args.rawAmount.toNumber(), 2000, "should be 200")
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
    beforeEach(async () => {
      await cs.setQualifiedPartner(addressA, 2e+18, 0)
    })

    it('adds a qualified address to the list with a cap amount', async () => {
      await cs.setQualifiedPartner(addressB, 2e+18, 0)
      let [ cap, amount, bonaFide ] = await cs.qualifiedPartners.call(addressB)

      assert.isTrue(bonaFide)
      assert.equal(cap.toNumber(), 2e+18)
    })

    it('unlists an address to the list', async () => {
      await cs.unlistQualifiedPartner(addressA)
      let [ ,, bonaFide ] = await cs.qualifiedPartners.call(addressA)

      assert.isFalse(bonaFide)
    })

    it('changes the qualified partner address cap limit', async () => {
      let [ cap, ...rest ] = await cs.qualifiedPartners.call(addressA)

      assert.equal(cap.toNumber(), 2e+18)

      await cs.updateQualifiedPartnerCapAmount(addressA, 3e+18)

      let [ kap, ...r ] = await cs.qualifiedPartners.call(addressA)

      assert.equal(kap.toNumber(), 3e+18)
    })

    it("creates event upon setting qualified partner", async () => {
      const { logs } = await cs.setQualifiedPartner(purchaser1, 2e+18, 0)

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
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase if an incorrect qualified partner', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser2, value: 1e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase with a cap larger than the figure the qualified partner is allowed to raise', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 3e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT let presale qualified purchasers to ignore hard cap once the crowdsale has started', async () => {
        const cs = await newCrowdsale()
        const startsAt = web3.eth.blockNumber - 40
        await cs.setup(token.address, startsAt)

        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.updateCnyEthRate(60000000)

        await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
        assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 78000000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 78000000)
      })
    })

    describe('able to purchase', () => {
      it('acquires with 30 percentage bonus', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.updateCnyEthRate(2000)

        await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2600) // total of CNY with bonus

        const purchase = await cs.crowdsalePurchases(0)
        assert.equal(purchase[0].toString(), purchaser1)
        assert.equal(purchase[1].toNumber(), 2600)
        assert.equal(purchase[1].toNumber(), 2600)

        assert.equal(purchase[4].toString(), '')
        assert.equal(purchase[5].toNumber(), 30)
      })

      it('allows for more than one qualified partners to purchase with 30 percentage bonus', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.setQualifiedPartner(purchaser2, 2e+18, 0)
        await cs.updateCnyEthRate(2000)

        await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        await cs.purchaseAsQualifiedPartner({ from: purchaser2, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 5200)

        const purchase = await cs.crowdsalePurchases(1)
        assert.equal(purchase[0].toString(), purchaser2)
        assert.equal(purchase[1].toNumber(), 2600)
        assert.equal(purchase[2].toNumber(), 2000)

        assert.equal(purchase[4].toString(), '')
        assert.equal(purchase[5].toNumber(), 30)
      })

      it('lets presale purchases ignore the crowdsale cap', async () => {
        const cs = await newCrowdsale()
        const startsAt = web3.eth.blockNumber + 40
        await cs.setup(token.address, startsAt)

        await cs.setQualifiedPartner(purchaser1, 60000000e+18, 0)
        await cs.setQualifiedPartner(purchaser2, 60000000e+18, 0)
        await cs.updateCnyEthRate(60000000)

        const test = await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        const test1 = await cs.purchaseAsQualifiedPartner({ from: purchaser2, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 156000000)

        const purchase = await cs.crowdsalePurchases(1)
        assert.equal(purchase[0].toString(), purchaser2)
        assert.equal(purchase[1].toNumber(), 78000000)
        assert.equal(purchase[2].toNumber(), 60000000)

        assert.equal(purchase[4].toString(), '')
        assert.equal(purchase[5].toNumber(), 30)
      })

      it('automatically pays qualified partners commission fee', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 3) // 3% commission fee
        await cs.setQualifiedPartner(purchaser2, 2e+18, 5) // 5% commission feee
        await cs.updateCnyEthRate(1000)

        const beforePurchaser1Balance = web3.eth.getBalance(purchaser1).toNumber()
        const beforePurchaser2Balance = web3.eth.getBalance(purchaser2).toNumber()
        const beforeContractBalance = web3.eth.getBalance(cs.address).toNumber()

        await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
        await cs.purchaseAsQualifiedPartner({ from: purchaser2, value: 1e+18 })

        const purchaser1ThreePercentCommision = (1e+18 * 3) / 100
        const purchaser2FivePercentCommision = (1e+18 * 5) / 100

        assert.approximately(web3.eth.getBalance(purchaser1).toNumber(), (beforePurchaser1Balance - 1e+18) + purchaser1ThreePercentCommision, purchaser1ThreePercentCommision)

        assert.approximately(web3.eth.getBalance(purchaser2).toNumber(), (beforePurchaser2Balance - 1e+18) + purchaser2FivePercentCommision, purchaser2FivePercentCommision)

        assert.equal(web3.eth.getBalance(cs.address).toNumber(), (beforeContractBalance + 2e+18) - (purchaser1ThreePercentCommision + purchaser2FivePercentCommision))
      })
    })
  })

  describe('starting crowdsale', () => {
    it('should not allow to start the crowdsale before the specified block number', async () => {
      const cs = await newCrowdsale()

      // when the block number has not been set yet
      try {
        await cs.updateCnyEthRate(1000)
        await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
        assert.fail()
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal((await cs.startDate()).toNumber(), 0)

      // when the block number is in the future
      const startsAt = web3.eth.blockNumber + 3
      await cs.setup(token.address, startsAt)  // start at the 1st block number
      try {
        await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
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
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
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
      await cs.setup(token.address, web3.eth.blockNumber + 30)
      await cs.updateCnyBtcRate(2000)

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
      assert(purchase[3].toNumber(), purchaseAt)
      assert.equal(
        purchase[4].toString(),
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
      assert.strictEqual(logs[0].args.rawAmount.toNumber(), 2, "should be 2")
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

  describe('Fallback fuction', () => {
    it('treats a purchase as a pre-sale purchase when a qualified partner sends money to the contract before the crowdsale starts', async () => {
        cs = await newCrowdsale()
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)

        // when the block number is in the future
        const startsAt = web3.eth.blockNumber + 30
        await cs.setup(token.address, startsAt)
        await cs.updateCnyEthRate(2000)

        await cs.sendTransaction({ from: purchaser1, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2600)

        const purchase = await cs.crowdsalePurchases(0)
        assert.equal(purchase[0].toString(), purchaser1)
        assert.equal(purchase[1].toNumber(), 2600)
        assert.equal(purchase[1].toNumber(), 2600)

        assert.equal(purchase[4].toString(), '')
        assert.equal(purchase[5].toNumber(), 30)
    })

    it('does NOT allow unqualified partner to send money to the contract before the crowdsale starts', async () => {
        const cs = await newCrowdsale()
        // when the block number is in the future
        const startsAt = web3.eth.blockNumber + 30
        await cs.setup(token.address, startsAt)
        await cs.updateCnyEthRate(1000)

        try {
          await cs.sendTransaction({ from: purchaser1, value: 1e+18 })
        } catch (error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 0)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
        assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 0)
        assert.equal(
          (await cs.totalRaisedAmountInCny()).toNumber(), 0
        )
    })

    it('allows purchases to acquire Star tokens once the crowdsale starts', async () => {
      const startDate = await cs.startDate()
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(1000)
      await cs.sendTransaction({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
      assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 1200)
      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 1000)
      assert.equal(
        (await cs.totalRaisedAmountInCny()).toNumber(), 1200
      )

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 1200)
      assert.equal(purchase[2].toNumber(), 1000)

      assert.isAtLeast(purchase[3].toNumber(), startDate)

      assert.equal(purchase[4].toString(), '')
      assert.equal(purchase[5].toNumber(), 20) // 20 percent bonus
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

      await cs.amendPurchase(1, purchaser2, 60, 60, utils.getBlockNow(), '', 20)
      await cs.amendPurchase(2, purchaser1, 60, 60, utils.getBlockNow(), '', 20)
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
        await cs.amendPurchase(0, purchaser2, 60, 60, utils.getBlockNow(), '', 20)
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

    it('returns the difference in purchase when a purchaser goes over the max cap', async () => {
      const purchase1Balance = await web3.eth.getBalance(purchaser1)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 72000000) // purchase with bonus was recorded as the purchase was done within the max cap of 6000000
      assert.equal(purchase[2].toNumber(), 60000000) // purchase with bonus was recorded as the purchase was done within the max cap of 6000000
    })

    it('returns the difference in purchase to purchaser not counting bonus when purchaser goes over max cap - edge case', async () => {
      await cs.updateCnyEthRate(59000000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 59000000)
      const purchase1Balance = await web3.eth.getBalance(purchaser1)
      await cs.updateCnyEthRate(5000000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const purchase = await cs.crowdsalePurchases(1) // second purchase
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 1200000) // only the bonus on 1M CNY is recorded not on 5M
      assert.equal(purchase[2].toNumber(), 1000000) // only the bonus on 1M CNY is recorded not on 5M

      const purchase1CurrentBalance = await web3.eth.getBalance(purchaser1)

      // Should have the difference back. About 4M CNY is return back as in ETH
      const cnyReturnValueToEther = (purchase1Balance.toNumber() * 1e+18) / 4000000
      assert.approximately(purchase1CurrentBalance.toNumber(), purchase1Balance.toNumber(), cnyReturnValueToEther)
    })
  })
})
