pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

import './AbstractStarbaseToken.sol';

/**
 * @title Crowdsale contract - Starbase marketing campaign contract to reward supportors
 * @author Starbase PTE. LTD. - <info@starbase.co>
 */
contract StarbaseMarketingCampaign is Ownable {
    /*
     *  Events
     */
    event NewContributor (address indexed contributorAddress, uint256 tokenCount);
    event WithdrawContributorsToken(address indexed contributorAddress, uint256 tokenWithdrawn);

    /**
     *  External contracts
     */
    AbstractStarbaseToken public starbaseToken;

    /**
     * Types
     */
    struct Contributor {
        uint256 rewardedTokens;
        mapping (bytes32 => bool) contributions;  // example: keccak256(bcm-xda98sdf) => true
        bool isContributor;
    }

    /**
     *  Storage
     */
    address[] public contributors;
    mapping (address => Contributor) public contributor;

    /**
     *  Functions
     */

    /**
     * @dev Contract constructor sets owner address.
     */
    function StarbaseMarketingCampaign() {
        owner = msg.sender;
    }

    /*
     *  External Functions
     */

    /**
     * @dev Setup function sets external contracts' addresses.
     * @param starbaseTokenAddress Token address.
     */
    function setup(address starbaseTokenAddress)
        external
        onlyOwner
        returns (bool)
    {
        require(starbaseTokenAddress != address(0));
        require(address(starbaseToken) == 0);

        starbaseToken = AbstractStarbaseToken(starbaseTokenAddress);
        return true;
    }

    /**
     * @dev Allows for marketing contributor's reward adding and withdrawl
     * @param contributorAddress The address of the contributor
     * @param tokenCount Token number to awarded and to be withdrawn
     * @param contributionId Id of contribution from bounty app db
     */
    function deliverRewardedTokens(
        address contributorAddress,
        uint256 tokenCount,
        string contributionId
    )
        external
        onlyOwner
        returns(bool)
    {

        bytes32 id = keccak256(contributionId);

        assert(!contributor[contributorAddress].contributions[id]);
        contributor[contributorAddress].contributions[id] = true;

        contributor[contributorAddress].rewardedTokens = SafeMath.add(contributor[contributorAddress].rewardedTokens, tokenCount);

        if (!contributor[contributorAddress].isContributor) {
            contributor[contributorAddress].isContributor = true;
            contributors.push(contributorAddress);
            NewContributor(contributorAddress, tokenCount);
        }

        starbaseToken.allocateToMarketingSupporter(contributorAddress, tokenCount);
        WithdrawContributorsToken(contributorAddress, tokenCount);

        return true;
    }


    /**
     *  Public Functions
     */

    /**
     * @dev Informs about contributors rewardedTokens and transferredRewardTokens status
     * @param contributorAddress A contributor's address
     * @param contributionId Id of contribution from bounty app db
     */
    function getContributorInfo(address contributorAddress, string contributionId)
        constant
        public
        returns (uint256, bool, bool)
    {
        bytes32 id = keccak256(contributionId);

        return(
          contributor[contributorAddress].rewardedTokens,
          contributor[contributorAddress].contributions[id],
          contributor[contributorAddress].isContributor
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
