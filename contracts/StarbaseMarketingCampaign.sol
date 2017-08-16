pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';

import './AbstractStarbaseToken.sol';

/**
 * @title Crowdsale contract - Starbase marketing campaign contract to reward supportors
 * @author Starbase PTE. LTD. - <info@starbase.co>
 */
contract StarbaseMarketingCampaign {
    /*
     *  Events
     */
    event NewContributor (address indexed contributorAddress, uint256 tokenCount);
    event UpdateContributorsTokens(address indexed contributorAddress, uint256 tokenCount);
    event WithdrawContributorsToken(address indexed contributorAddress, uint256 tokenWithdrawn, uint remainingTokens);

    /**
     *  External contracts
     */
    AbstractStarbaseToken public starbaseToken;

    /**
     * Types
     */
    struct Contributor {
        uint256 rewardTokens;
        uint256 transferredRewardTokens;
    }

    /**
     *  Storage
     */
    address public owner;
    address public workshop;  // holds undelivered STARs
    address[] public contributors;
    mapping (address => Contributor) public contributor;

    /**
     *  Modifiers
     */
    modifier onlyOwner() {
        // Only owner is allowed to do this action.
        assert(msg.sender == owner);
        _;
    }

    /**
     *  Functions
     */

    /**
     * @dev Contract constructor sets owner and workshop address.
     * @param workshopAddr The address that will hold undelivered Star tokens
     */
    function StarbaseMarketingCampaign(address workshopAddr) {
        require(workshopAddr != address(0));
        owner = msg.sender;
        workshop = workshopAddr;
    }

    /*
     *  External Functions
     */

    /**
     * @dev Allows for marketing contributor's reward withdrawl
     * @param contributorAddress The address of the contributor
     * @param tokensToTransfer Token number to withdraw
     */
    function withdrawRewardedTokens (address contributorAddress, uint256 tokensToTransfer) external {
        require(contributor[contributorAddress].rewardTokens > 0 && tokensToTransfer <= contributor[contributorAddress].rewardTokens && address(starbaseToken) != 0);

        contributor[contributorAddress].rewardTokens = SafeMath.sub(contributor[contributorAddress].rewardTokens, tokensToTransfer);

        contributor[contributorAddress].transferredRewardTokens = SafeMath.add(contributor[contributorAddress].transferredRewardTokens, tokensToTransfer);

        starbaseToken.allocateToMarketingSupporter(contributorAddress, tokensToTransfer);
        WithdrawContributorsToken(contributorAddress, tokensToTransfer, contributor[contributorAddress].rewardTokens);
    }

    /**
     * @dev Setup function sets external contracts' addresses.
     * @param starbaseTokenAddress Token address.
     */
    function setup(address starbaseTokenAddress)
        external
        onlyOwner
        returns (bool)
    {
        assert(address(starbaseToken) == 0);
        starbaseToken = AbstractStarbaseToken(starbaseTokenAddress);
        return true;
    }

    /**
     * @dev Include new contributor
     * @param contributorAddress A contributor's address
     * @param tokenCount number of tokens assigned to contributor on their inclusion
     */
    function addRewardforNewContributor (address contributorAddress, uint256 tokenCount) external onlyOwner {
        assert(contributor[contributorAddress].rewardTokens == 0 && contributor[contributorAddress].transferredRewardTokens == 0);

        contributor[contributorAddress].rewardTokens = tokenCount;
        contributors.push(contributorAddress);
        NewContributor(contributorAddress, tokenCount);
    }

    /**
     * @dev Updates contributors rewardTokens
     * @param contributorAddress A contributor's address
     * @param tokenCount number of tokens to update for the contributor
     */
    function updateRewardForContributor (address contributorAddress, uint256 tokenCount)
        external
        onlyOwner
        returns (bool)
    {
        assert(contributor[contributorAddress].rewardTokens > 0);

        contributor[contributorAddress].rewardTokens = SafeMath.add(contributor[contributorAddress].rewardTokens, tokenCount);
        UpdateContributorsTokens(contributorAddress, tokenCount);
        return true;
    }

    /**
     *  Public Functions
     */

    /**
     * @dev Informs about contributors rewardTokens and transferredRewardTokens status
     * @param contributorAddress A contributor's address
     */
    function getContributorInfo(address contributorAddress)
      constant
      public
      returns (uint256, uint256)
    {
        return(
          contributor[contributorAddress].rewardTokens,
          contributor[contributorAddress].transferredRewardTokens
        );
    }

    /**
     * @dev Returns number of contributors.
     */
    function numberOfContributors()
      constant
      public
      returns (uint256)
    {
      return contributors.length;
    }
}
