const utils = require('./helpers/utils')

const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')

contract('StarbaseMarketingCampaign', accounts => {
  const owner = accounts[0]
  const contributor1 = accounts[1]
  const contributor2 = accounts[2]
  const mkgWorkshop = accounts[3]
  let mkgCampaign
  let crowdsale
  let token

  const newToken = (crowdsaleAddr) => {
    return StarbaseToken.new(owner, crowdsaleAddr, mkgCampaign.address)
  }

  before(() => {
    return StarbaseCrowdsale.deployed().then(inst => crowdsale = inst)
  })

  beforeEach('initialize crowdsale contract', async () => {
    mkgCampaign = await StarbaseMarketingCampaign.new(mkgWorkshop)
  })

  it('is able to instantiate contract with a workshop address', async () => {
    assert.equal(await mkgCampaign.workshop.call(), mkgWorkshop)
  })

  it('sets an address of StarbaseToken contract', async () => {
    token = await newToken(crowdsale.address)
    await mkgCampaign.setup(token.address)

    assert.equal(await mkgCampaign.starbaseToken.call(), token.address)
  })

  describe('contributors of the marketing campaign', () => {
    describe('new contributor', () => {
      it('does NOT let contributors add themselves', async () => {
        try {
          await mkgCampaign.addRewardforNewContributor.sendTransaction(contributor1, 20000, 'bcm-xda98sdf', { from: contributor1 });
        } catch (error) {
          utils.ensuresException(error)
        }

        const contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 0)
      })

      it('does NOT double add a contribution', async () => {
        await mkgCampaign.addRewardforNewContributor(contributor1, 200, 'bcm-xda98sdf');

        try {
          await mkgCampaign.addRewardforNewContributor(contributor1, 20000, 'bcm-xda98sdf');
          assert.fail()
        } catch (error) {
          utils.ensuresException(error)
        }

        const contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 1)
      })

      it('adds contributors with their Star reward amount', async () => {
        await mkgCampaign.addRewardforNewContributor(contributor1, 200, 'bcm-xda98sdf');
        const [ rewardTokens, transferredRewardTokens, hasId ] = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(rewardTokens), 200) // number reward tokens
        assert.equal(parseInt(transferredRewardTokens), 0) // number of tokens transferred to contributor
        assert.equal(hasId, true) // contribution id is set

        const contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 1)
      })

      it("logs NewContributor event", async () => {
        const { logs } = await mkgCampaign.addRewardforNewContributor(contributor1, 200, 'bcm-xda98sdf');

        assert.strictEqual(logs.length, 1, 'should have received 1 event')

        assert.strictEqual(logs[0].args.contributorAddress, contributor1, "should be accounts[1] address")
        assert.strictEqual(logs[0].args.tokenCount.toNumber(), 200, "should be 200")
      })

      it('stores number of contributors to date', async () => {
        await mkgCampaign.addRewardforNewContributor(contributor1, 200, 'bcm-xda98sdf');

        let contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 1)

        await mkgCampaign.addRewardforNewContributor(contributor2, 50, 'bcm-xda98sdf');

        contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 2)
      })
    })

    describe('updating contributor', () => {
      beforeEach(async () => {
        await mkgCampaign.addRewardforNewContributor(contributor1, 200, 'bcm-xda98sdf');
      })

      it('does NOT allow contributor to update their own reward', async () => {
        try {
          await mkgCampaign.updateRewardForContributor.sendTransaction(contributor1, 100, 'bcm-xda98sdf', { from: contributor1 });
        } catch (error) {
          utils.ensuresException(error)
        }

        const [ rewardTokens, transferredRewardTokens, hasId ] = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(rewardTokens), 200) // number reward tokens
        assert.equal(parseInt(transferredRewardTokens), 0) // number of tokens transferred to contributor
        assert.equal(hasId, true) // contribution id is set
      })

      it('updates a contributor with their reward', async () => {
        await mkgCampaign.updateRewardForContributor(contributor1, 100, 'bcm-xda98sdf');
        const [ rewardTokens, transferredRewardTokens, hasId ] = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(rewardTokens), 300) // number reward tokens
        assert.equal(parseInt(transferredRewardTokens), 0) // number of tokens transferred to contributor
        assert.equal(hasId, true) // contribution id is set
      })

      it('allows for reward updates even when contributor has transferred all their reward tokens', async () => {
        token = await newToken(crowdsale.address)
        await mkgCampaign.setup(token.address)
        await mkgCampaign.withdrawRewardedTokens.sendTransaction(contributor1, 200, { from: contributor1 });

        await mkgCampaign.updateRewardForContributor(contributor1, 100, 'bcm-xda98sdf');

        const [ rewardTokens, transferredRewardTokens, hasId ] = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(rewardTokens), 100) // number reward tokens
        assert.equal(parseInt(transferredRewardTokens), 200) // number of tokens transferred to contributor
        assert.equal(hasId, true) // contribution id is set
      })

      it("logs UpdateContributorsTokens event", async () => {
        const { logs } = await mkgCampaign.updateRewardForContributor(contributor1, 200, 'bcm-xda98sdf');

        assert.strictEqual(logs.length, 1, 'should have received 1 event')

        assert.strictEqual(logs[0].args.contributorAddress, contributor1, "should be accounts[1] address")
        assert.strictEqual(logs[0].args.tokenCount.toNumber(), 200, "should be 200")
      })
    })

    describe('withdrawing rewards', () => {
      beforeEach(async () => {
        token = await newToken(crowdsale.address)
        await mkgCampaign.setup(token.address)
        await mkgCampaign.addRewardforNewContributor(contributor1, 200, 'bcm-xda98sdf');
      })

      it('does NOT allow to withdraw more tokens than they were awarded', async () => {
        try {
          await mkgCampaign.withdrawRewardedTokens.sendTransaction(contributor1, 400, { from: contributor1 });
        } catch (error) {
          utils.ensuresException(error)
        }

        const contributor1Rewards = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(contributor1Rewards[0]), 200) // number reward tokens
        assert.equal(parseInt(contributor1Rewards[1]), 0) // number of tokens transferred to contributor
      })

      it('does NOT allow to withdraw if their reward is 0 tokens', async () => {
        await mkgCampaign.addRewardforNewContributor(contributor2, 0, 'bcm-xda98sdf');

        try {
          await mkgCampaign.withdrawRewardedTokens.sendTransaction(contributor2, 0, { from: contributor2 });
        } catch (error) {
          utils.ensuresException(error)
        }

        const contributor1Rewards = await mkgCampaign.getContributorInfo(contributor2, 'bcm-xda98sdf')

        assert.equal(parseInt(contributor1Rewards[0]), 0) // number reward tokens
        assert.equal(parseInt(contributor1Rewards[1]), 0) // number of tokens transferred to contributor
      })

      it('does NOT allow to withdraw by an account who is neither owner nor the contributor', async () => {
        try {
          await mkgCampaign.withdrawRewardedTokens(contributor1, 200, { from: contributor2 })
          assert.fail()
        } catch (error) {
          utils.ensuresException(error)
        }

        await mkgCampaign.withdrawRewardedTokens(contributor1, 100, { from: contributor1 })

        assert.equal((await token.balanceOf(contributor1)).toNumber(), 100)
      })

      it('should not have a lock up term for marketing supporters', async () => {
        const now = utils.getBlockNow()
        await mkgCampaign.withdrawRewardedTokens(contributor1, 200);

        // should allow to transfer tokens
        await token.transfer(contributor2, 1, { from: contributor1 })
        assert.equal((await token.balanceOf(contributor1)).toNumber(), 199) // - 1 from transfer
        assert.equal((await token.balanceOf(contributor2)).toNumber(), 1)
      })

      it('withdraws token who have reward tokens', async () => {
        await mkgCampaign.withdrawRewardedTokens(contributor1, 200);
        const contributor1Rewards = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(contributor1Rewards[0]), 0) // number reward tokens
        assert.equal(parseInt(contributor1Rewards[1]), 200) // number of tokens transferred to contributor
      })

      it('substracts rewarded tokens from workshop address', async () => {
        const totalTokensAssignedToMarketing = 12500000e+18
        let balance = await token.balanceOf.call(await mkgCampaign.workshop.call())
        assert.equal(balance.toNumber(), totalTokensAssignedToMarketing) // total alocation for marketing campaign

        await mkgCampaign.withdrawRewardedTokens(contributor1, 200);

        balance = await token.balanceOf.call(await mkgCampaign.workshop.call())
        const result = totalTokensAssignedToMarketing - 200
        assert.equal(balance.toNumber(), result)
      })

      it("logs WithdrawContributorsToken event", async () => {
        const txObject = await mkgCampaign.withdrawRewardedTokens(contributor1, 200);

        assert.strictEqual(txObject.logs.length, 1, 'should have received 1 event')

        assert.strictEqual(txObject.logs[0].args.contributorAddress, contributor1, "should be accounts[1] address")
        assert.strictEqual(txObject.logs[0].args.tokenWithdrawn.toNumber(), 200, "should be 200")
        assert.strictEqual(txObject.logs[0].args.remainingTokens.toNumber(), 0, "should be 0")
      })
    })
  })
})
