const MultiSigWalletFactory = artifacts.require('./MultiSigWalletFactory.sol')

contract('MultiSigWalletFactory', accounts => {
  const creator = accounts[0]
  const owner1 = accounts[0]
  const owner2 = accounts[1]
  const owner3 = accounts[2]
  let factory

  beforeEach('initialize multi-sig wallet factory', async () => {
    factory = await MultiSigWalletFactory.new()
  })

  it('is able to create multi-sig wallets', async () => {
    const watcher = factory.ContractInstantiation();  // event watcher

    // 1st wallet
    await factory.create([owner1, owner2, owner3], 2)
    assert.equal(
      await factory.instantiations.call(creator, 0),
      watcher.get()[0].args.instantiation)

    // 2nd wallet
    await factory.create([owner1, owner2, owner3], 2)
    assert.equal(
      await factory.instantiations.call(creator, 1),
      watcher.get()[0].args.instantiation)

    // 3rd wallet
    await factory.create([owner1, owner2, owner3], 2)
    assert.equal(
      await factory.instantiations.call(creator, 2),
      watcher.get()[0].args.instantiation)

    assert.equal((await factory.getInstantiationCount.call(creator)).toNumber(), 3)
  })
})
