import { ensuresException, getBlockNow } from './helpers/utils'

const StarbaseMarketingCampaign = artifacts.require('./StarbaseMarketingCampaign.sol')
const StarbaseToken = artifacts.require('./StarbaseToken.sol')
const StarbaseCrowdsale = artifacts.require('./StarbaseCrowdsale.sol')

contract('StarbaseMarketingCampaign', accounts => {
    const owner = accounts[0]
    const contributor1 = accounts[1]
    const contributor2 = accounts[2]
    let mkgCampaign
    let token

    const newToken = () => {
      return StarbaseToken.new(
        owner, StarbaseCrowdsale.address, mkgCampaign.address)
    }

    beforeEach('initialize crowdsale contract', async () => {
        mkgCampaign = await StarbaseMarketingCampaign.new()
    })

    it('sets an address of StarbaseToken contract', async () => {
        token = await newToken()
        await mkgCampaign.setup(token.address)

        assert.equal(await mkgCampaign.starbaseToken.call(), token.address)
    })

    describe('contributors of the marketing campaign', () => {
      beforeEach(async () => {
          token = await newToken()
          await mkgCampaign.setup(token.address)
      })

      it('does NOT let contributors add themselves', async () => {
        try {
          await mkgCampaign.deliverRewardedTokens.sendTransaction(contributor1, 20000, 'bcm-xda98sdf', { from: contributor1 });
          assert.fail()
        } catch (error) {
          ensuresException(error)
        }

        const contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 0)
      })

      it('does NOT permit for multiple contribution by the same person with the same contribution id', async () => {
          await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');

          try {
              await mkgCampaign.deliverRewardedTokens(contributor1, 20000, 'bcm-xda98sdf')
              assert.fail()
          } catch (error) {
              ensuresException(error)
          }

          const contributorsNumber = await mkgCampaign.numberOfContributors.call()
          assert.equal(contributorsNumber.toNumber(), 1) // number of contributors is still one
          assert.equal((await token.balanceOf(contributor1)).toNumber(), 200)
      })

      it('allows for multiple contribution by the same person with different contribution ids', async () => {
          await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');
          await mkgCampaign.deliverRewardedTokens(contributor1, 20000, 'different-one');

          const contributorsNumber = await mkgCampaign.numberOfContributors.call()

          assert.equal(contributorsNumber.toNumber(), 1) // number of contributors is still one

          assert.equal((await token.balanceOf(contributor1)).toNumber(), 20200)
      })

      it('adds contributors with their Star reward amount', async () => {
        await mkgCampaign.deliverRewardedTokens.sendTransaction(contributor1, 200, 'bcm-xda98sdf', { from: owner });
        const [ rewardedTokens, hasContributionId, hasId ] = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

        assert.equal(parseInt(rewardedTokens), 200) // number reward tokens
        assert.equal(hasContributionId, true) // contribution id is set
        assert.equal(hasId, true) // contribution id is set

        const contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 1)
      })

      it("logs NewContributor event", async () => {
        const { logs } = await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');

        assert.strictEqual(logs.length, 2, 'should have received 2 event')

        assert.strictEqual(logs[0].args.contributorAddress, contributor1, "should be accounts[1] address")
        assert.strictEqual(logs[0].args.tokenCount.toNumber(), 200, "should be 200")
      })

      it("logs WithdrawContributorsToken event", async () => {
        const { logs } = await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');

        assert.strictEqual(logs.length, 2, 'should have received 2 event')

        assert.strictEqual(logs[1].args.contributorAddress, contributor1, "should be accounts[1] address")
        assert.strictEqual(logs[1].args.tokenWithdrawn.toNumber(), 200, "should be 200")
      })

      it('stores number of contributors to date even when there is multipe contributions by the same contributor', async () => {
        await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');
        await mkgCampaign.deliverRewardedTokens(contributor1, 10, 'different-one');

        let contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 1)

        await mkgCampaign.deliverRewardedTokens(contributor2, 50, 'bcm-xda98sdf');
        await mkgCampaign.deliverRewardedTokens(contributor2, 60, 'different-one');

        contributorsNumber = await mkgCampaign.numberOfContributors.call()

        assert.equal(contributorsNumber, 2)
      })

      it('does NOT allow to withdraw by an account who is neither owner nor the contributor', async () => {
          try {
              await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf', { from: contributor2 })
              assert.fail()
          } catch (error) {
              ensuresException(error)
          }
      })

      it('should not have a lock up term for marketing supporters', async () => {
          const now = getBlockNow()
          await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');

          // should allow to transfer tokens
          await token.transfer(contributor2, 1, { from: contributor1 })
          assert.equal((await token.balanceOf(contributor1)).toNumber(), 199) // - 1 from transfer
          assert.equal((await token.balanceOf(contributor2)).toNumber(), 1)
      })

      it('gets contributor info based on id', async () => {
          await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');
          const contributor1Rewards = await mkgCampaign.getContributorInfo(contributor1, 'bcm-xda98sdf')

          assert.equal(parseInt(contributor1Rewards[0]), 200) // number reward tokens
          assert.equal(contributor1Rewards[1], true)
          assert.equal(contributor1Rewards[2], true)
      })

      it('substracts rewarded tokens from workshop address', async () => {
          const totalTokensAssignedToMarketing = 12500000e+18
          let balance = await token.balanceOf.call(mkgCampaign.address)
          assert.equal(balance.toNumber(), totalTokensAssignedToMarketing) // total alocation for marketing campaign

          await mkgCampaign.deliverRewardedTokens(contributor1, 200, 'bcm-xda98sdf');

          balance = await token.balanceOf.call(mkgCampaign.address)
          const result = totalTokensAssignedToMarketing - 200
          assert.equal(balance.toNumber(), result)
      })
    })
})
