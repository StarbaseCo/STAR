const timer = require('./helpers/timer')
const utils = require('./helpers/utils')

const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')
const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')

contract('StarbaseCrowdsale (Bonus Milestones)', accounts => {
  const purchaser1 = accounts[1]
  const csWorkshop = accounts[0]
  const epaAddress = accounts[2]
  const dummyAddr = accounts[3]  // dummy

  let cs
  let startDate
  let totalAmountOfEP
  const secondsInADay = 86400

  const newCrowdsale = () => {
    return StarbaseCrowdsale.new(csWorkshop, epaAddress)
  }

  beforeEach('initialize crowdsale contract', async () => {
    cs = await newCrowdsale()
    const mkgCampaign = await StarbaseMarketingCampaign.new(dummyAddr)
    const token = await StarbaseToken.new(dummyAddr, cs.address, mkgCampaign.address)
    totalAmountOfEP = await cs.totalAmountOfEarlyPurchases()

    await cs.setup(token.address, web3.eth.blockNumber)
    await cs.updateCnyBtcRate(20000)
    await cs.recordOffchainPurchase(purchaser1, 0, utils.getBlockNow(), 'btc:xxx') // starts the crowdsale
    startDate = await cs.startDate()
  })

  it('lets purchasers buy STARs with Ether at 20% bonus tokens within the first 7 days of crowdsale', async () => {
    await timer(secondsInADay)

    const firstBonusSalesEnds = await cs.firstBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2400)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), (totalAmountOfEP.toNumber() + 2400)
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2400)

    assert.isAtLeast(purchase[3].toNumber(), startDate)
    assert.isAtMost(purchase[3].toNumber(), firstBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 20)
  })

  it('lets STARs purchasers to receive 20% bonus tokens at the end of first bonus sales milestones (edge case)', async () => {
    const firstBonusSalesEnds = await cs.firstBonusSalesEnds()
    const secondsToFirstBonusSalesEnds = (firstBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToFirstBonusSalesEnds - 2) // two seconds before firstBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2400)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2400
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2400)

    assert.isAtMost(purchase[3].toNumber(), firstBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 20)
  })

  it('should give 15 % bonus tokens for purchasers of STARs btw the 8th and 21st day', async () => {
    const fifteenDaysAsSeconds = secondsInADay * 15
    await timer(fifteenDaysAsSeconds)

    const firstBonusSalesEnds = await cs.firstBonusSalesEnds()
    const secondBonusSalesEnds = await cs.secondBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2300)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2300
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2300)

    assert.isAtLeast(purchase[3].toNumber(), firstBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), secondBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 15)
  })

  it('lets STARs purchasers to receive 15% bonus tokens at the end of second bonus sales milestones (edge case)', async () => {
    const secondBonusSalesEnds = await cs.secondBonusSalesEnds()
    const secondsToSecondBonusSalesEnds = (secondBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToSecondBonusSalesEnds - 2) // two seconds before secondBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2300)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2300
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2300)

    assert.isAtMost(purchase[3].toNumber(), secondBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 15)
  })

  it('should give 10 % bonus tokens for purchasers of STARs btw the 22nd and 35th day', async () => {
    const twentyFiveDaysAsSeconds = secondsInADay * 25
    await timer(twentyFiveDaysAsSeconds)

    const secondBonusSalesEnds = await cs.secondBonusSalesEnds()
    const thirdBonusSalesEnds = await cs.thirdBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2200)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2200
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2200)
    assert.isAtLeast(purchase[3].toNumber(), secondBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), thirdBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 10)
  })

  it('lets STARs purchasers to receive 10% bonus tokens at the end of second bonus sales milestones (edge case)', async () => {
    const thirdBonusSalesEnds = await cs.thirdBonusSalesEnds()
    const secondsToThirdBonusSalesEnds = (thirdBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToThirdBonusSalesEnds - 2) // two seconds before thirdBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2200)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2200
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2200)

    assert.isAtMost(purchase[3].toNumber(), thirdBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 10)
  })

  it('should give 5 % bonus tokens for purchasers of STARs btw the 36th and 42nd day', async () => {
    const fortyDaysAsSeconds = secondsInADay * 40
    await timer(fortyDaysAsSeconds)

    const thirdBonusSalesEnds = await cs.thirdBonusSalesEnds()
    const fourthBonusSalesEnds = await cs.fourthBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    const purchase = await cs.crowdsalePurchases(1)

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2100)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2100
    )

    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2100)
    assert.isAtLeast(purchase[3].toNumber(), thirdBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), fourthBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 5)
  })

  it('lets STARs purchasers to receive 5% bonus tokens at the end of second bonus sales milestones (edge case)', async () => {
    const fourthBonusSalesEnds = await cs.fourthBonusSalesEnds()
    const secondsToFourthBonusSalesEnds = (fourthBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToFourthBonusSalesEnds - 2) // two seconds before fourthBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2100)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2100
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2100)

    assert.isAtMost(purchase[3].toNumber(), fourthBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 5)
  })

  it('should give 0 % bonus tokens for purchasers of STARs between 43rd and 45th day', async () => {
    const fortyfourDaysAsSeconds = secondsInADay * 44
    await timer(fortyfourDaysAsSeconds)

    const fourthBonusSalesEnds = await cs.fourthBonusSalesEnds()
    const fifthBonusSalesEnds = await cs.fifthBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    const purchase = await cs.crowdsalePurchases(1)

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2000)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),
      totalAmountOfEP.toNumber() + 2000)

    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2000)
    assert.isAtLeast(purchase[3].toNumber(), fourthBonusSalesEnds.toNumber())
    assert.isAtMost(purchase[3].toNumber(), fifthBonusSalesEnds.toNumber())
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 0)
  })

  it('lets STARs purchasers to receive 0% bonus tokens at the end of second bonus sales milestones (edge case)', async () => {
    const fifthBonusSalesEnds = await cs.fifthBonusSalesEnds()
    const secondsToFifthBonusSalesEnds = (fifthBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToFifthBonusSalesEnds - 2) // two seconds before fifthBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2000)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2000
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2000)

    assert.isAtMost(purchase[3].toNumber(), fifthBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 0)
  })

  it('allows STARs purchases with 20% bonus tokens btw the 46th and 48th day of crowdsale', async () => {
    const fortySevenDaysAsSeconds = secondsInADay * 47
    await timer(fortySevenDaysAsSeconds)

    const firstExtendedBonusSalesEnds = await cs.firstExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2400)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2400
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2400)

    assert.isAtLeast(purchase[3].toNumber(), startDate)
    assert.isAtMost(purchase[3].toNumber(), firstExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 20)
  })

  it('lets STARs purchasers to receive 20% bonus tokens at the exact end of first extended bonus sales milestones (edge case)', async () => {
    const firstExtendedBonusSalesEnds = await cs.firstExtendedBonusSalesEnds()
    const secondsToFirstExtendedBonusSalesEnds = (firstExtendedBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToFirstExtendedBonusSalesEnds - 2) // two seconds before firstExtendedBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2400)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2400
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2400)

    assert.isAtMost(purchase[3].toNumber(), firstExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 20)
  })

  it('should give 15 % bonus tokens for purchasers of STARs btw the 49th and 51st day', async () => {
    const fiftyDaysAsSeconds = secondsInADay * 50
    await timer(fiftyDaysAsSeconds)

    const firstExtendedBonusSalesEnds = await cs.firstExtendedBonusSalesEnds()
    const secondExtendedBonusSalesEnds = await cs.secondExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2300)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2300
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2300)

    assert.isAtLeast(purchase[3].toNumber(), firstExtendedBonusSalesEnds)
    assert.isBelow(purchase[3].toNumber(), secondExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 15)
  })

  it('lets STARs purchasers to receive 15% bonus tokens at the exact end of second extended bonus sales milestones (edge case)', async () => {
    const secondExtendedBonusSalesEnds = await cs.secondExtendedBonusSalesEnds()
    const secondsToSecondExtendedBonusSalesEnds = (secondExtendedBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToSecondExtendedBonusSalesEnds - 2) // two seconds before secondExtendedBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2300)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2300
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2300)

    assert.isAtMost(purchase[3].toNumber(), secondExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 15)
  })

  it('allows STARs purchases with 10% bonus tokens btw the 52nd ~ 54th day of crowdsale', async () => {
    const fiftyThreeDaysAsSeconds = secondsInADay * 53
    await timer(fiftyThreeDaysAsSeconds)

    const secondExtendedBonusSalesEnds = await cs.secondExtendedBonusSalesEnds()
    const thirdExtendedBonusSalesEnds = await cs.thirdExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2200)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2200
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2200)
    assert.isAtLeast(purchase[3].toNumber(), secondExtendedBonusSalesEnds)
    assert.isBelow(purchase[3].toNumber(), thirdExtendedBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 10)
  })

  it('lets STARs purchasers to receive 10% bonus tokens at the end of second extended bonus sales milestones (edge case)', async () => {
    const thirdExtendedBonusSalesEnds = await cs.thirdExtendedBonusSalesEnds()
    const secondsToThirdExtendedBonusSalesEnds = (thirdExtendedBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToThirdExtendedBonusSalesEnds - 2) // two seconds before thirdExtendedBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2200)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2200
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2200)

    assert.isAtMost(purchase[3].toNumber(), thirdExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 10)
  })

  it('should give 5 % bonus tokens for purchasers of STARs btw the 55th and 57th day day', async () => {
    const fiftySixDaysAsSeconds = secondsInADay * 56
    await timer(fiftySixDaysAsSeconds)

    const thirdExtendedBonusSalesEnds = await cs.thirdExtendedBonusSalesEnds()
    const fourthExtendedBonusSalesEnds = await cs.fourthExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2100)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2100
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2100)
    assert.isAtLeast(purchase[3].toNumber(), thirdExtendedBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), fourthExtendedBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 5)
  })

  it('lets STARs purchasers to receive 5% bonus tokens at the exact end of second extended bonus sales milestones (edge case)', async () => {
    const fourthExtendedBonusSalesEnds = await cs.fourthExtendedBonusSalesEnds()
    const secondsToFourthExtendedBonusSalesEnds = (fourthExtendedBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToFourthExtendedBonusSalesEnds - 2) // two seconds before fourthExtendedBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2100)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2100
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2100)

    assert.isAtMost(purchase[3].toNumber(), fourthExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 5)
  })

  it('should give 0 % bonus tokens for purchasers of STARs between the 58th and 60th day', async () => {
    const fiftyNineDaysAsSeconds = secondsInADay * 59
    await timer(fiftyNineDaysAsSeconds)

    const fourthExtendedBonusSalesEnds = await cs.fourthExtendedBonusSalesEnds()
    const fifthExtendedBonusSalesEnds = await cs.fifthExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2000)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2000
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2000)
    assert.isAtLeast(purchase[3].toNumber(), fourthExtendedBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), fifthExtendedBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 0)
  })

  it('lets STARs purchasers to receive 0% bonus tokens at the exact end of second extended bonus sales milestones (edge case)', async () => {
    const fifthExtendedBonusSalesEnds = await cs.fifthExtendedBonusSalesEnds()
    const secondsToFifthExtendedBonusSalesEnds = (fifthExtendedBonusSalesEnds.toNumber() - startDate.toNumber())

    await timer(secondsToFifthExtendedBonusSalesEnds - 2) // two seconds before fifthExtendedBonusSalesEnds is reached
    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })

    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2000)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(),totalAmountOfEP.toNumber() + 2000
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2000)

    assert.isAtMost(purchase[3].toNumber(), fifthExtendedBonusSalesEnds)

    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 0)
  })

  it(' allows bonus token bonus to accrue between 61st and 120th day -- 1%', async () => {
    const sixtyOneDaysAsSeconds = secondsInADay * 61
    await timer(sixtyOneDaysAsSeconds)

    const fifthExtendedBonusSalesEnds = await cs.fifthExtendedBonusSalesEnds()
    const sixthExtendedBonusSalesEnds = await cs.sixthExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2020)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2020
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2020)
    assert.isAtLeast(purchase[3].toNumber(), fifthExtendedBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), sixthExtendedBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 1)
  })

  it(' allows bonus token bonus to accrue between 61st and 120th day -- 22%', async () => {
    const eightyTwoDaysAsSeconds = secondsInADay * 82
    await timer(eightyTwoDaysAsSeconds)

    const fifthExtendedBonusSalesEnds = await cs.fifthExtendedBonusSalesEnds()
    const sixthExtendedBonusSalesEnds = await cs.sixthExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 2440)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 2440
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 2440)
    assert.isAtLeast(purchase[3].toNumber(), fifthExtendedBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), sixthExtendedBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 22)
  })

  it('allows bonus token bonus to accrue between 61st and 120th day-- 59%', async () => {
    const oneHundredAndNineteenDaysAsSeconds = secondsInADay * 119
    await timer(oneHundredAndNineteenDaysAsSeconds)

    const fifthExtendedBonusSalesEnds = await cs.fifthExtendedBonusSalesEnds()
    const sixthExtendedBonusSalesEnds = await cs.sixthExtendedBonusSalesEnds()

    await cs.updateCnyEthRate(2000)
    await cs.purchaseWithEth({ from: purchaser1, value: 1e+18 })
    assert.equal((await cs.numOfPurchases.call()).toNumber(), 2)
    assert.equal((await cs.totalAmountOfCrowdsalePurchases.call()).toNumber(), 3180)
    assert.equal(
      (await cs.totalRaisedAmountInCny()).toNumber(), totalAmountOfEP.toNumber() + 3180
    )

    const purchase = await cs.crowdsalePurchases(1)
    assert.equal(purchase[0].toString(), purchaser1)
    assert.equal(purchase[1].toNumber(), 3180)
    assert.isAtLeast(purchase[3].toNumber(), fifthExtendedBonusSalesEnds)
    assert.isAtMost(purchase[3].toNumber(), sixthExtendedBonusSalesEnds)
    assert.equal(purchase[4].toString(), '')
    assert.equal(purchase[5].toNumber(), 59)
  })
})
