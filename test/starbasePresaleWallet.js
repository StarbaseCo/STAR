const utils = require('./helpers/utils')
const timer = require('./helpers/timer')

const StarbasePresaleWallet = artifacts.require('./StarbasePresaleWallet.sol')

contract('StarbasePresaleWallet', accounts => {
  const owner1 = accounts[0]
  const owner2 = accounts[1]
  const owner3 = accounts[2]
  const addressA = accounts[3]
  const addressB = accounts[4]
  const someone  = accounts[5]
  const maxCap = 30e+15
  let wallet

  beforeEach('initialize presale wallet contract', async () => {
    wallet = await StarbasePresaleWallet.new([owner1, owner2, owner3], 2, maxCap)
  })

  it('is able to instantiate contract with 3 owners and 2 required', async () => {
    assert.equal((await wallet.required.call()).toNumber(), 2)
    assert.equal((await wallet.owners.call(0)).toString(), owner1)
    assert.equal((await wallet.owners.call(1)).toString(), owner2)
    assert.equal((await wallet.owners.call(2)).toString(), owner3)
  })

  describe('ability to whitelist and unwhitelist addresses', () => {
    beforeEach(async () => {
      await wallet.whitelistAddress(addressA, 20e+15)
    })

    it('adds an address to the list with a cap amount', async () => {
      let [ cap, amount, bonaFide ] = await wallet.whitelistedAddresses.call(addressA)
      assert.isTrue(bonaFide)
      assert.equal(cap.toNumber(), 20e+15)
    })

    it('removes an address to the list', async () => {
      await wallet.unwhitelistAddress(addressA)

      let [ ,, bonaFide ] = await wallet.whitelistedAddresses.call(addressA)

      assert.isFalse(bonaFide)
    })

    it('changes the an address cap limit', async () => {
      let [ cap, ...rest ] = await wallet.whitelistedAddresses.call(addressA)

      assert.equal(cap.toNumber(), 20e+15)

      await wallet.changeWhitelistedAddressCapAmount(addressA, 21e+15)

      let [ kap, ...r ] = await wallet.whitelistedAddresses.call(addressA)

      assert.equal(kap.toNumber(), 21e+15)
    })
  })

  describe('payment', () => {
    it('does not allow payment from unlisted addresses', async () => {
      try {
        await wallet.payment.sendTransaction({ from: addressB, value: 1e+15 })
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal(await web3.eth.getBalance(wallet.address).toNumber(), 0)
    })

    it('allows payment from whitelisted addresses', async () => {
      await wallet.whitelistAddress(addressB, 20e+15)

      await wallet.payment.sendTransaction({ from: addressB, value: 1e+15 })

      let [ cap, amount, bonaFide ] = await wallet.whitelistedAddresses.call(addressB)

      assert.equal(amount.toNumber(), 1e+15)

      await timer(20)// give enough time for the block to register the wallet balance.
      assert.equal(await web3.eth.getBalance(wallet.address).toNumber(), 1e+15)
    })

    it("logs succesful payments", async () => {
      await wallet.whitelistAddress(addressA, 20e+15)

      const { logs } = await wallet.payment({ from: addressA, value: 1e+15 })

      assert.equal(logs.length, 1, 'should have received 1 event log')

      assert.equal(logs[0].args.sender, addressA)
      assert.equal(logs[0].args.value.toNumber(), 1e+15)
    })

    it('prohibits whitelisted addresses to go over their cap', async () => {
      await wallet.whitelistAddress(addressA, 20e+15)

      await wallet.payment.sendTransaction({ from: addressA, value: 20e+15 })

      try {
        await wallet.payment.sendTransaction({ from: addressA, value: 1e+15 })
        assert.fail()
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal(web3.eth.getBalance(wallet.address).toNumber(), 20e+15)
    })

    it('does not permit the wallet balance to go over the hard cap', async () => {
      await wallet.whitelistAddress(addressB, 30e+15)

      await wallet.payment.sendTransaction({ from: addressB, value: 30e+15 })

      try {
        await wallet.payment.sendTransaction({ from: addressB, value: 1e+15 })
        assert.fail()
      } catch (error) {
        utils.ensuresException(error)
      }
      assert.equal(web3.eth.getBalance(wallet.address).toNumber(), 30e+15)
    })
  })

  it('is able to change the maximum cap by an owner', async () => {
    await wallet.whitelistAddress(addressA, 30e+15)
    await wallet.whitelistAddress(addressB, 10e+15)
    assert.equal((await wallet.maxCap.call()).toNumber(), 30e+15)
    await wallet.sendTransaction({ from: addressA, value: 30e+15 })

    await wallet.changeMaxCap(40e+15)
    assert.equal((await wallet.maxCap.call()).toNumber(), 40e+15)
    await wallet.payment.sendTransaction({ from: addressB, value: 10e+15 })
    assert.equal(web3.eth.getBalance(wallet.address).toNumber(), 40e+15)
  })

  it("must not reset total purchased amount by withdrawing wallet's balance", async () => {
    const someonesOrigBalance = web3.eth.getBalance(someone)
    await wallet.whitelistAddress(addressA, 30e+15)
    assert.equal((await wallet.maxCap.call()).toNumber(), 30e+15)
    await wallet.sendTransaction({ from: addressA, value: 30e+15 })

    await wallet.submitTransaction(someone, 10e+15, '')
    await wallet.confirmTransaction(0, { from: owner2 })
    assert.equal(web3.eth.getBalance(wallet.address).toNumber(), 20e+15)
    assert.equal(web3.eth.getBalance(someone).toNumber() - someonesOrigBalance, 10e+15)

    try {
      await wallet.sendTransaction({ from: addressA, value: 1 })
      assert.fail()
    } catch (error) {
      utils.ensuresException(error)
    }
    assert.equal(web3.eth.getBalance(wallet.address).toNumber(), 20e+15)
  })
})
