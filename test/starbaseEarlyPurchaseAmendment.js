const utils = require('./helpers/utils')

const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseEarlyPurchase = artifacts.require('./StarbaseEarlyPurchase.sol')
const StarbaseEarlyPurchaseAmendment = artifacts.require('./StarbaseEarlyPurchaseAmendment.sol')

contract('StarbaseEarlyPurchaseAmendment', accounts => {
  const eth = web3.eth
  const founder = eth.accounts[0]
  const account1 = eth.accounts[1]
  const account2 = eth.accounts[2]

  const newEP = () => StarbaseEarlyPurchase.new()
  const newEPA = () => StarbaseEarlyPurchaseAmendment.new()
  const currentTimestamp = () => Math.floor(Date.now() / 1000)

  it('should be able to setup address of StarbaseCrowdsale contract', async () => {
     const epa = await newEPA()
     const crowdsale = await StarbaseCrowdsale.deployed()
     await epa.setup(crowdsale.address)
     assert.equal(await epa.starbaseCrowdsale.call(), crowdsale.address)
  })

  it('should not allow to set an early purchase contract has not been closed yet', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())

    const epa = await newEPA()
    try {
      await epa.loadStarbaseEarlyPurchases(ep.address)
    } catch (e) {
      utils.ensuresException(e)
    }

    assert.equal(await epa.starbaseEarlyPurchase.call(), 0);
  })

  it('should not accept appending an early purchase', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    try {
      await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    } catch (e) {
      utils.ensuresException(e)
    }

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 1)
  })

  it('should be able to load early purchases from another early purchase contract', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.appendEarlyPurchase(account2, 20000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 30000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 3)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 40000)
  })

  it('should be able to load early purchases from another early purchase contract', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.appendEarlyPurchase(account2, 20000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 30000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 3)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 40000)
  })

  it('should be able to invalidate early purchases', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.appendEarlyPurchase(account2, 20000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 30000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 20000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    await epa.invalidateEarlyPurchase(0)
    await epa.invalidateEarlyPurchase(1)

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 2)
    assert.equal((await epa.totalAmountOfEarlyPurchases.call()).toNumber(), 50000)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 50000)
    assert.equal((await epa.purchasedAmountBy.call(account2)).toNumber(), 0)
  })

  it('should be able to amend early purchases', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.appendEarlyPurchase(account2, 20000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 30000, currentTimestamp())
    await ep.appendEarlyPurchase(account1, 20000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    await epa.amendEarlyPurchase(0, account2, 10000, currentTimestamp())
    await epa.amendEarlyPurchase(1, account2, 25000, currentTimestamp())

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 4)
    assert.equal((await epa.totalAmountOfEarlyPurchases.call()).toNumber(), 85000)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 50000)
    assert.equal((await epa.purchasedAmountBy.call(account2)).toNumber(), 35000)
  })

  it('should not allow to amend an invalidated early purchase', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    await epa.invalidateEarlyPurchase(0)
    try {
      await epa.amendEarlyPurchase(0, account2, 10000, currentTimestamp())
    } catch (e) {
      utils.ensuresException(e)
    }

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 0)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 0)
    assert.equal((await epa.purchasedAmountBy.call(account2)).toNumber(), 0)
  })

  it('should allow to invalidate an amended early purchase', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    await epa.amendEarlyPurchase(0, account2, 10000, currentTimestamp())
    await epa.invalidateEarlyPurchase(0)

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 0)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 0)
    assert.equal((await epa.purchasedAmountBy.call(account2)).toNumber(), 0)
  })

  it('should allow to amend an early purchase more than once', async () => {
    const ep = await newEP()
    await ep.appendEarlyPurchase(account1, 10000, currentTimestamp())
    await ep.closeEarlyPurchase()

    const epa = await newEPA()
    await epa.loadStarbaseEarlyPurchases(ep.address)
    await epa.amendEarlyPurchase(0, account2, 10000, currentTimestamp())
    await epa.amendEarlyPurchase(0, account2, 5000, currentTimestamp())

    const num = await epa.numberOfEarlyPurchases.call()
    assert.equal(num.toNumber(), 1)
    assert.equal((await epa.purchasedAmountBy.call(account1)).toNumber(), 0)
    assert.equal((await epa.purchasedAmountBy.call(account2)).toNumber(), 5000)
  })
})
