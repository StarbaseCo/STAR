const timer = require('./helpers/timer')
const utils = require('./helpers/utils')

const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')
const MultiCertifier = artifacts.require('./MultiCertifier.sol')

contract('StarbaseCrowdsale', accounts => {

  const founder1 = accounts[0]
  const purchaser1 = accounts[1]
  const purchaser2 = accounts[2]
  const purchaser3 = accounts[3]
  const company = accounts[4]
  const addressA = accounts[5]
  const addressB = accounts[6]
  const addressC = accounts[7]
  const presale1 = accounts[8]
  const presale2 = accounts[9]
  const totalAmountOfEP = 6000000;

  let mkgCampaign
  let cs
  let token
  let earlyPurchaseAmendment
  let startDate
  let purchaseAt
  const secondsInADay = 86400
  const firstBonusEnds =  360000
  const secondBonusEnds = 720000
  const thirdBonusEnds =  980000
  const fourthBonusEnds = 1340000

  const newCrowdsale = (customEpa) => {
    if (customEpa) {
      return StarbaseCrowdsale.new(customEpa.address, MultiCertifier.address)
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
        return StarbaseCrowdsale.new(epa.address, MultiCertifier.address)
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

  it('should NOT setup without a StarbaseToken contract address', async () => {
      cs = await newCrowdsale()
      try {
          await cs.setup('0x0', web3.eth.blockNumber)
          assert.fail()
      } catch(e) {
          utils.ensuresException(e)
      }
      assert.equal(await cs.starbaseToken.call(), '0x0000000000000000000000000000000000000000') // still not setup
  })

  it('should be able to set an address of StarbaseToken contract', async () => {
    assert.equal(await cs.starbaseToken.call(), token.address)
  })

  it('should determine a max crowdsale cap from MAX_CAP and early purchase result', async () => {
    const now = utils.getBlockNow()
    const ep = await StarbaseEarlyPurchase.new()
    await ep.appendEarlyPurchase(purchaser1, 3000000, now)
    await ep.appendEarlyPurchase(purchaser1, 706328, now)
    await ep.closeEarlyPurchase()
    const epa = await StarbaseEarlyPurchaseAmendment.new()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    assert.equal((await epa.totalAmountOfEarlyPurchases.call()).toNumber(), 3706328)

    const cs = await newCrowdsale(epa)
    await cs.setup(token.address, now)
    assert.equal((await cs.maxCrowdsaleCap.call()).toNumber(), 63293672)
  })

  it("logs StarbasePurchasedWithEth event", async () => {
    await cs.updateCnyEthRate(2000)
    await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    const { logs } = await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.strictEqual(logs.length, 1, 'should have received 1 event')

    assert.strictEqual(logs[0].args.purchaser, purchaser1, "should be accounts[4] address")
    assert.strictEqual(logs[0].args.amount.toNumber(), 2400, "amount should be 2400") // with 20% bonus
    assert.strictEqual(logs[0].args.rawAmount.toNumber(), 2000, " rawAmount should be 2000")
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

  })

  it('should NOT permit other addresses to update purchase start block', async () => {
    const purchaseStartBlock = await cs.purchaseStartBlock()

    try {
      await cs.updatePurchaseStartBlock.sendTransaction(web3.eth.blockNumber + 150, { from: purchaser1 })
      assert.fail()
    } catch (error) {
      utils.ensuresException(error)
    }
    const currentPurchaseStartBlock = await cs.purchaseStartBlock()

    assert.equal(currentPurchaseStartBlock.toNumber(), purchaseStartBlock.toNumber())
  })

  it('should NOT allow the update of purchase start block if the crowdsale is afoot', async () => {
    const purchaseStartBlock = await cs.purchaseStartBlock()
    await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
    await cs.updateCnyEthRate(1000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    try {
      await cs.updatePurchaseStartBlock.sendTransaction(web3.eth.blockNumber + 150, { from: founder1 })
      assert.fail()
    } catch (error) {
      utils.ensuresException(error)
    }
    const currentPurchaseStartBlock = await cs.purchaseStartBlock()

    assert.equal(currentPurchaseStartBlock.toNumber(), purchaseStartBlock.toNumber())
  })

  it('should allow contract owner to update purchase start block', async () => {
    const purchaseStartBlock = await cs.purchaseStartBlock()
    await cs.updatePurchaseStartBlock.sendTransaction(purchaseStartBlock.toNumber() + 150, { from: founder1 })

    const newPurchaseStartBlock = await cs.purchaseStartBlock()
    assert.isAbove(newPurchaseStartBlock.toNumber(), purchaseStartBlock.toNumber())
    assert.equal(newPurchaseStartBlock.toNumber(), purchaseStartBlock.toNumber() + 150)
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

  describe('presale purchases', () => {
    it('should be loaded from another contract', async () => {
      const presale = await newCrowdsale()
      token = await newToken(presale.address)
      await presale.setup(token.address, web3.eth.blockNumber + 20) // future block
      await presale.setQualifiedPartner(presale1, 1e+18, 0)
      await presale.setQualifiedPartner(presale2, 1e+18, 5)
      await presale.updateCnyEthRate(100000)
      await presale.sendTransaction({ from: presale1, value: 1e+15 })
      await presale.sendTransaction({ from: presale1, value: 1e+15 })
      await presale.sendTransaction({ from: presale2, value: 3e+15 })

      cs = await newCrowdsale()
      await cs.loadPresalePurchases(presale.address)
      assert.equal((await cs.numOfPurchases()).toNumber(), 3)
      assert.equal((await cs.totalAmountOfCrowdsalePurchases()).toNumber(), 650)
      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus()).toNumber(), 500)
      assert.equal((await cs.crowdsalePurchaseAmountBy(presale1)).toNumber(), 260)
      assert.equal((await cs.crowdsalePurchaseAmountBy(presale2)).toNumber(), 390)
    })
  })

  describe('qualified Partner', () => {
    beforeEach(async () => {
        cs = await newCrowdsale()
        token = await newToken(cs.address)
        await cs.setup(token.address, web3.eth.blockNumber + 20) // future block
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
      it('does NOT record purchase if value send is zilch', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 0 })
          assert.fail()
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase without a qualified partner set', async () => {
        await cs.updateCnyEthRate(2000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
          assert.fail()
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT record purchase without ETH rate set', async () => {
        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })
          assert.fail()
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
          assert.fail()
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
          assert.fail()
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 0)
      })

      it('does NOT let presale qualified purchasers to ignore hard cap once the crowdsale has started', async () => {
        const ep = await StarbaseEarlyPurchase.new()
        await ep.appendEarlyPurchase(purchaser2, 7000000, utils.getBlockNow())
        await ep.closeEarlyPurchase()
        const epa = await StarbaseEarlyPurchaseAmendment.new()
        await epa.loadStarbaseEarlyPurchases(ep.address)

        const cs = await newCrowdsale(epa)
        const startsAt = web3.eth.blockNumber - 40
        await cs.setup(token.address, startsAt)

        await cs.setQualifiedPartner(purchaser1, 2e+18, 0)
        await cs.updateCnyEthRate(60000000) // = crowdsale cap = 67000000 - 7000000

        await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 1e+18 })

        assert.equal((await cs.numOfPurchases.call()).toNumber(), 1)
        assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 60000000)

        try {
          await cs.purchaseAsQualifiedPartner({ from: purchaser1, value: 3e+18 })
          assert.fail()
        } catch(error) {
          utils.ensuresException(error)
        }

        assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)
        assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 60000000)
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
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)

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
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      const startsAt = web3.eth.blockNumber + 2
      await cs.setup(token.address, startsAt)
      await cs.updateCnyEthRate(1000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      assert.isBelow(utils.getBlockNow() - (await cs.startDate()).toNumber(), 5) // started just now
    })

    it('does NOT allow owner to start crowdsale before purchase block has been reached', async () => {
      const cs = await newCrowdsale()
      const startsAt = web3.eth.blockNumber + 30
      await cs.setup(token.address, startsAt)

      try {
        await cs.ownerStartsCrowdsale(utils.getBlockNow())
      } catch (e) {
        utils.ensuresException(e)
      }

      assert.equal((await cs.startDate()).toNumber(), 0)
    })

    it('does NOT allow owner to overrride start date of crowdsale', async () => {
      const cs = await newCrowdsale()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      const startsAt = web3.eth.blockNumber
      await cs.setup(token.address, startsAt)
      await cs.updateCnyEthRate(1000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      const startDate = await cs.startDate()

      try {
        await cs.ownerStartsCrowdsale(utils.getBlockNow())
      } catch (e) {
        utils.ensuresException(e)
      }

      assert.equal((await cs.startDate()).toNumber(), startDate.toNumber())
    })

    it('allows owner to start crowdsale', async () => {
      const cs = await newCrowdsale()
      const startsAt = web3.eth.blockNumber
      await cs.setup(token.address, startsAt)
      const startDate = utils.getBlockNow()

      await cs.ownerStartsCrowdsale(startDate)
      assert.equal((await cs.startDate()).toNumber(), startDate)
    })

    it('is able to start crowdsale even if no allocation is left the main sale', async () => {
      const cs = await newCrowdsale()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      const startsAt = web3.eth.blockNumber + 4  // a little future
      await cs.setup(token.address, startsAt)
      await cs.updateCnyEthRate(70000000)
      await cs.sendTransaction({ from: purchaser1, value: 1e+18 })  // pre sale

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 91000000)
      assert.equal(purchase[2].toNumber(), 70000000)

      const startDate = utils.getBlockNow()
      await cs.ownerStartsCrowdsale(utils.getBlockNow())
      assert.equal((await cs.startDate()).toNumber(), startDate)

      assert.equal((await cs.firstBonusEnds()).toNumber(), 0)
      assert.equal((await cs.secondBonusEnds()).toNumber(), 0)
      assert.equal((await cs.thirdBonusEnds()).toNumber(), 0)
      assert.equal((await cs.fourthBonusEnds()).toNumber(), 0)
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

    it('cannot end a crowdsale before it starts', async () => {
        const cs = await newCrowdsale()
        const token = await newToken(cs.address)
        await cs.setup(token.address, web3.eth.blockNumber + 30)
        await cs.updateCnyBtcRate(2000)
        const now = utils.getBlockNow() // base timestamp off the blockchain

        try {
          await cs.endCrowdsale(now)
          assert.fail()
        } catch(error) {
          utils.ensuresException(error)
        }
    })

    it('errors with a time higher than now', async () => {
      const now = utils.getBlockNow() // base timestamp off the blockchain

      try {
        await cs.endCrowdsale(now + 20)
        assert.fail()
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

    it('should be ended by a purchase which reaches the max cap', async () => {
      const cs = await newCrowdsale()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(67000000) // = crowdsale cap
      await cs.setQualifiedPartner(purchaser1, 1e+18, 0)
      await cs.sendTransaction({ from: purchaser1, value: 1e+18 })  // main sale
      assert.equal((await cs.endedAt.call()).toNumber(), utils.getBlockNow())
    })
  })

  describe('delivery of tokens', () => {
    it('delivers right amout of STARs for crowdsale and early purchasers', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser1, 3500000, now)
      await ep.appendEarlyPurchase(purchaser2, 3500000, now)
      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)

      const cs = await newCrowdsale(epa)
      await cs.loadEarlyPurchases()
      assert.equal((await cs.earlyPurchasedAmountBy(purchaser1)).toNumber(), 4200000) // 3500000 + 700000 (20% bonus)
      assert.equal((await cs.earlyPurchasedAmountBy(purchaser2)).toNumber(), 4200000) // 3500000 + 700000 (20% bonus)

      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(60000000)
      await cs.setQualifiedPartner(purchaser3, 1e+18, 0)
      await cs.sendTransaction({ from: purchaser3, value: 1e+18 })  // this ends the crowdsale
      assert((await cs.endedAt()).toNumber() > 0)
      assert.equal((await cs.crowdsalePurchaseAmountBy(purchaser3)).toNumber(), 66000000)

      await cs.withdrawPurchasedTokens({ from: purchaser3 })
      await cs.withdrawPurchasedTokens({ from: purchaser2 })
      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      assert.equal(
        (await token.balanceOf(purchaser2)).toString(),
        (await token.balanceOf(purchaser2)).toString())
      assert((await token.balanceOf(cs.address)).toNumber() < 1e18) // small reminder
    })

    it('returns the number of purchased tokens by a purchaser upon delivery', async () => {
      const cs = await newCrowdsale()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())
      assert.equal((await cs.numOfPurchasedTokensOnCsBy.call(purchaser1)).toNumber(), 0) // this tracks amount of token delivered. Zero here because user has not triggered the delivery yet.

      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      assert.equal((await cs.numOfPurchasedTokensOnCsBy.call(purchaser1)).toNumber(), 1.25e+26) // total tokens including 20% bonus
      assert.equal((await cs.numOfPurchasedTokensOnCsBy.call(purchaser2)).toNumber(), 0)
    })

    it('updates the cny purchase value of the pucharses and zeroes it once tokens are delivered', async () => {
      const cs = await newCrowdsale()
      await cs.loadEarlyPurchases()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())
      assert.equal((await cs.crowdsalePurchaseAmountBy.call(purchaser1)).toNumber(), 2400) // CNY amount with bonus

      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      assert.equal((await cs.crowdsalePurchaseAmountBy.call(purchaser1)).toNumber(), 0) // cny amount from mapping function is zeroed after token delivery by user
    })

    it('calculates the number of purchases from the same investor even if investor purchases multiple times', async () => {
      const cs = await newCrowdsale()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.setQualifiedPartner(purchaser2, 2000000e+18, 0)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())
      assert.equal((await cs.crowdsalePurchaseAmountBy.call(purchaser1)).toNumber(), 4800) // CNY amount with bonus

      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      await cs.withdrawPurchasedTokens({ from: purchaser2 })
      assert.equal((await cs.crowdsalePurchaseAmountBy.call(purchaser1)).toNumber(), 0) // cny amount from mapping function is zeroed after token delivery by user
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 6.25e+25) // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 6.25e+25) // total tokens including 20%
    })

    it('makes the the token figure remain the same even if user calls the withdrawPurchasedTokens multiple times', async () => {
      const cs = await newCrowdsale()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())
      assert.equal((await cs.crowdsalePurchaseAmountBy.call(purchaser1)).toNumber(), 2400) // CNY amount with bonus

      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      assert.equal((await cs.crowdsalePurchaseAmountBy.call(purchaser1)).toNumber(), 0) // cny amount from mapping function is zeroed after token delivery by user
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 1.25e+26) // total tokens including 20%

      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 1.25e+26)
      assert.equal((await cs.numOfDeliveredCrowdsalePurchases.call()).toNumber(), 1)
    })

    it('keeps track of the number of delivered crowdsale purchase', async () => {
      const cs = await newCrowdsale()
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.setQualifiedPartner(purchaser2, 2000000e+18, 0)
      await cs.setQualifiedPartner(addressA, 2000000e+18, 0)
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.loadEarlyPurchases()
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      await cs.purchaseWithEth({ from: addressA, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.withdrawPurchasedTokens.sendTransaction({ from: purchaser1 })

      assert.equal((await cs.numOfDeliveredCrowdsalePurchases.call()).toNumber(), 1) // index of crowdsalePurchases when gas ran out.
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by purchaser1 first time') // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 0, 'Number of tokens by purchaser2 first time') // total tokens including 20%
      assert.equal((await token.balanceOf(addressA)).toNumber(), 0, 'Number of tokens by addressA first time') // total tokens including 20%

      await cs.withdrawPurchasedTokens.sendTransaction({ from: purchaser2 })
      await cs.withdrawPurchasedTokens.sendTransaction({ from: addressA })

      assert.equal((await cs.numOfDeliveredCrowdsalePurchases.call()).toNumber(), 3)
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by purchaser1 second time') // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by purchaser2 second time') // total tokens including 20%
      assert.equal((await token.balanceOf(addressA)).toNumber(), 4.1666666666666664e+25, 'Number of tokens by addressA second time') // total tokens including 20%
    })

    it('should be able to load early puchases from StarbaseEarlyPurchaseAmendment contract with 20% bonus', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser2, 50, now)
      await ep.appendEarlyPurchase(purchaser1, 200, now)
      await ep.appendEarlyPurchase(purchaser1, 300, now)
      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)

      const cs = await newCrowdsale(epa)
      await cs.loadEarlyPurchases()
      assert.equal((await cs.earlyPurchasedAmountBy(purchaser1)).toNumber(), 600) // 500 + 100 (20% bonus)
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
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await timer(2) // wait a couple of secs
      await cs.updateCnyEthRate(2000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.withdrawPurchasedTokens({ from: purchaser1 })
      await cs.withdrawPurchasedTokens({ from: purchaser2 })
      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 158281315.02288805e+18) // purchase during crowdsale + early purchases.
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 16718684.977111944e+18)
    })

    it('keeps track of the number of delivered early purchases', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser1, 200, now)
      await ep.appendEarlyPurchase(purchaser2, 100, now)
      await ep.appendEarlyPurchase(founder1, 100, now)
      await ep.appendEarlyPurchase(addressA, 100, now)

      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)

      const cs = await newCrowdsale(epa)
      await cs.loadEarlyPurchases()
      const token = await newToken(cs.address)
      await cs.setup(token.address, web3.eth.blockNumber)
      await timer(2) // wait a couple of secs
      await cs.endCrowdsale(utils.getBlockNow())

      await cs.withdrawPurchasedTokens.sendTransaction({ from: purchaser1 })
      await cs.withdrawPurchasedTokens.sendTransaction({ from: purchaser2 })
      await cs.withdrawPurchasedTokens.sendTransaction({ from: founder1 })
      assert.equal((await cs.numOfDeliveredEarlyPurchases.call()).toNumber(), 3)

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 7e+25, 'Number of delivered tokens for purchaser1 first time entering the withdrawPurchasedTokens') // total tokens including 20%
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 3.5e+25, 'Number of delivered tokens for purchaser2 first time entering the withdrawPurchasedTokens') // total tokens including 20%
      assert.equal((await token.balanceOf(founder1)).toNumber(), 3.5e+25, 'Number of delivered tokens for founder1 first time entering the withdrawPurchasedTokens')
      assert.equal((await token.balanceOf(addressA)).toNumber(), 0, 'Number of delivered tokens for addressA first time entering the withdrawPurchasedTokens')

      await cs.withdrawPurchasedTokens.sendTransaction({ from: addressA })
      assert.equal((await cs.numOfDeliveredEarlyPurchases.call()).toNumber(), 4)

      assert.equal((await token.balanceOf(purchaser1)).toNumber(), 7e+25, 'Number of delivered tokens for purchaser1 second time entering the withdrawPurchasedTokens', 'Number of delivered tokens for purchaser2 second time entering the withdrawPurchasedTokens')
      assert.equal((await token.balanceOf(purchaser2)).toNumber(), 3.5e+25, 'Number of delivered tokens for founder1 second time entering the withdrawPurchasedTokens')
      assert.equal((await token.balanceOf(founder1)).toNumber(), 3.5e+25, 'Number of delivered tokens for addressA second time entering the withdrawPurchasedTokens')
      assert.equal((await token.balanceOf(addressA)).toNumber(), 3.5e+25, 'Number of delivered tokens for addressA')
    })
  })

  describe('#loadEarlyPurchases', () => {
    it('tracks the number of loaded early purchases', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser1, 2, now)
      await ep.appendEarlyPurchase(purchaser2, 1, now)
      await ep.appendEarlyPurchase(founder1, 1, now)
      await ep.appendEarlyPurchase(addressA, 1, now)

      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)
      const cs = await newCrowdsale(epa)

      const estimatedGas = await cs.loadEarlyPurchases.estimateGas()
      await cs.loadEarlyPurchases.sendTransaction({ gas: estimatedGas })

      assert.equal((await cs.numOfLoadedEarlyPurchases.call()).toNumber(), 2) // index when gas ran out in the loadEarlyPurchases function.

      assert.equal((await cs.earlyPurchasers(0)), purchaser1) // two elements in the earlyPurchasers array
      assert.equal((await cs.earlyPurchasers(1)), purchaser2)
      assert.equal((await cs.earlyPurchasedAmountBy.call(purchaser1)).toNumber(), 2)
      assert.equal((await cs.earlyPurchasedAmountBy.call(purchaser2)).toNumber(), 1)

      await cs.loadEarlyPurchases() // continues loading earlyPurchasers from index it was left off from

      assert.equal((await cs.numOfLoadedEarlyPurchases.call()).toNumber(), 4) // all should be loaded

      assert.equal((await cs.earlyPurchasers(2)), founder1) // check for next early purchaser loaded after out of gas exception.
      assert.equal((await cs.earlyPurchasers(3)), addressA) // // check for last early purchaser
      assert.equal((await cs.earlyPurchasedAmountBy.call(founder1)).toNumber(), 1)

      assert.equal((await cs.earlyPurchasedAmountBy.call(addressA)).toNumber(), 1)
    })

    it('correctly updates the index even if there are invalidated purchases', async () => {
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(addressA, 1, now)
      await ep.appendEarlyPurchase(addressC, 2, now)
      await ep.appendEarlyPurchase(purchaser3, 1, now)
      await ep.appendEarlyPurchase(purchaser1, 2, now)
      await ep.appendEarlyPurchase(founder1, 1, now)

      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)
      const cs = await newCrowdsale(epa)

      const estimatedGas = await cs.loadEarlyPurchases.estimateGas()
      await cs.loadEarlyPurchases.sendTransaction({ gas: estimatedGas })

      assert.equal((await cs.numOfLoadedEarlyPurchases.call()).toNumber(), 3) // index when gas ran out in the loadEarlyPurchases function.
      assert.equal((await cs.earlyPurchasers(0)), addressA)
      assert.equal((await cs.earlyPurchasers(1)), addressC)
      assert.equal((await cs.earlyPurchasedAmountBy.call(addressA)).toNumber(), 1)
      assert.equal((await cs.earlyPurchasedAmountBy.call(addressB)).toNumber(), 0) // invalidated
      assert.equal((await cs.earlyPurchasedAmountBy.call(addressC)).toNumber(), 2)

      assert.equal((await cs.earlyPurchasers(2)), purchaser3)
      assert.equal((await cs.earlyPurchasedAmountBy.call(purchaser3)).toNumber(), 1)
      assert.equal((await cs.earlyPurchasedAmountBy.call(purchaser1)).toNumber(), 0) // not loaded yet
      assert.equal((await cs.earlyPurchasedAmountBy.call(founder1)).toNumber(), 0) // not loaded yet

      await cs.loadEarlyPurchases.sendTransaction({ gas: estimatedGas }) // continues loading earlyPurchasers from index it was left off from
      assert.equal((await cs.numOfLoadedEarlyPurchases.call()).toNumber(), 5) // final array index

      assert.equal((await cs.earlyPurchasers(3)), purchaser1)
      assert.equal((await cs.earlyPurchasers(4)), founder1)
      assert.equal((await cs.earlyPurchasedAmountBy.call(purchaser1)).toNumber(), 2)
      assert.equal((await cs.earlyPurchasedAmountBy.call(purchaser2)).toNumber(), 0) // invalidated
      assert.equal((await cs.earlyPurchasedAmountBy.call(founder1)).toNumber(), 1)
    })

    it.skip('is able to load all the 171 early purchasers.', async () => {
      // NOTE this test takes a long time to run. Therefore it is skipped in CI. In order to test it. Remove `skip()` and start testrpc with the command `testrpc --accounts="171"`
      const now = utils.getBlockNow()
      const ep = await StarbaseEarlyPurchase.new()

      await Promise.all(
        [...Array(171).keys()].map(i =>
          ep.appendEarlyPurchase(accounts[i], 1, now)
        )
      )

      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)
      const cs = await newCrowdsale(epa)

      try {
          await cs.loadEarlyPurchases()
      } catch (e) {

      }

      assert.equal((await cs.numOfLoadedEarlyPurchases.call()).toNumber(), 72) // index when gas ran out in the loadEarlyPurchases function.
      assert.equal((await cs.earlyPurchasers(30)), accounts[30])
      assert.equal((await cs.earlyPurchasedAmountBy.call(accounts[30])).toNumber(), 1)

      try {
        await cs.loadEarlyPurchases()
      } catch (e) {

      }
      await cs.loadEarlyPurchases() // continues loading earlyPurchasers from index it was left off from
      assert.equal((await cs.numOfLoadedEarlyPurchases.call()).toNumber(), 171)

      assert.equal((await cs.earlyPurchasers(90)), accounts[90])
      assert.equal((await cs.earlyPurchasers(120)), accounts[120])
      assert.equal((await cs.earlyPurchasedAmountBy.call(accounts[90])).toNumber(), 1)
      assert.equal((await cs.earlyPurchasedAmountBy.call(accounts[120])).toNumber(), 1)

      await cs.setup(token.address, web3.eth.blockNumber)
      await cs.updateCnyEthRate(2000)
      await cs.setQualifiedPartner(purchaser1, 1e+18, 0)
      await Promise.all(
        [...Array(100).keys()].map(() =>
          cs.sendTransaction({ from: purchaser1, value: 1e+15 })
        )
      )
      await cs.endCrowdsale(utils.getBlockNow())
      assert(web3.eth.getBlock('latest').gasUsed < 50000)
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
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      try {
        await cs.withdrawForCompany()
      } catch (error) {
        utils.ensuresException(error)
      }
    })

    it('transfers contract balance', async () => {
      await cs.updateCnyEthRate(2000)
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const balanceBefore = web3.eth.getBalance(cs.address)

      await cs.withdrawForCompany()

      const balanceAfter = web3.eth.getBalance(cs.address)

      assert.isBelow(balanceAfter.toNumber(), balanceBefore.toNumber())
      assert.equal(balanceAfter.toNumber(), 0)
    })


    it('tranfers contract funds to company', async () => {
      await cs.updateCnyEthRate(2000)
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
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
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
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

    })
  })

  describe('crowdsale finishes automatically', () => {
    beforeEach('set up', async () => {
      const ep = await StarbaseEarlyPurchase.new()
      await ep.appendEarlyPurchase(purchaser3, 7000000, utils.getBlockNow())
      await ep.closeEarlyPurchase()
      const epa = await StarbaseEarlyPurchaseAmendment.new()
      await epa.loadStarbaseEarlyPurchases(ep.address)

      cs = await newCrowdsale(epa)
      const startsAt = web3.eth.blockNumber - 40
      await cs.setup(token.address, startsAt)
      await cs.updateCnyEthRate(60000000) // = crowdsale cap
    })

    it('halts crowdsale purchases when the cap reaches over 66M CNY', async () => {
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      try {
        await cs.purchaseWithEth({ from: purchaser2, value: 1e+18 })
      } catch (error) {
        utils.ensuresException(error)
      }
    })

    it('returns the difference in purchase when a purchaser goes over the max cap', async () => {
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)

      const purchase = await cs.crowdsalePurchases(0)
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 66000000) // purchase with bonus was recorded as the purchase was done within the max cap of 6000000
      assert.equal(purchase[2].toNumber(), 60000000) // purchase with bonus was recorded as the purchase was done within the max cap of 6000000
    })

    it('returns the difference in purchase to purchaser not counting bonus when purchaser goes over max cap - edge case', async () => {
      await cs.updateCnyEthRate(59000000)
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 59000000)
      const purchase1Balance = await web3.eth.getBalance(purchaser1)
      await cs.updateCnyEthRate(5000000)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      const purchase = await cs.crowdsalePurchases(1) // second purchase
      assert.equal(purchase[0].toString(), purchaser1)
      assert.equal(purchase[1].toNumber(), 1000000) // only the bonus on 1M CNY is recorded not on 5M
      assert.equal(purchase[2].toNumber(), 1000000) // only the bonus on 1M CNY is recorded not on 5M

      const purchase1CurrentBalance = await web3.eth.getBalance(purchaser1)

      // Should have the difference back. About 4M CNY is return back as in ETH
      const cnyReturnValueToEther = (purchase1Balance.toNumber() * 1e+18) / 4000000
      assert.approximately(purchase1CurrentBalance.toNumber(), purchase1Balance.toNumber(), cnyReturnValueToEther)
    })

    it('rejects further purchase transactions once it has reached the crowdsale max cap', async () => {
      await cs.setQualifiedPartner(purchaser1, 2000000e+18, 0)
      await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

      assert.equal((await cs.totalAmountOfCrowdsalePurchasesWithoutBonus.call()).toNumber(), 60000000)
      assert.equal((await cs.numOfPurchases()).toNumber(), 1)

      try {
        await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
        assert.fail()
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal((await cs.numOfPurchases()).toNumber(), 1)
    })
  })
})
