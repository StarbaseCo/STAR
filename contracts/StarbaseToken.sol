pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/StandardToken.sol';

import './AbstractStarbaseCrowdsale.sol';
import './AbstractStarbaseMarketingCampaign.sol';

/// @title Token contract - ERC20 compatible Starbase token contract.
/// @author Starbase PTE. LTD. - <info@starbase.co>
contract StarbaseToken is StandardToken {
    /*
     *  Events
     */
    event PublicOfferingPlanDeclared(uint256 tokenCount, uint256 unlockCompanysTokensAt);
    event MvpLaunched(uint256 launchedAt);
    event LogNewFundraiser (address indexed fundraiserAddress, bool isBonaFide);
    event LogUpdateFundraiser(address indexed fundraiserAddress, bool isBonaFide);

    /*
     *  Types
     */
    struct PublicOfferingPlan {
        uint256 tokenCount;
        uint256 unlockCompanysTokensAt;
        uint256 declaredAt;
    }

    /*
     *  External contracts
     */
    AbstractStarbaseCrowdsale public starbaseCrowdsale;
    AbstractStarbaseMarketingCampaign public starbaseMarketingCampaign;

    /*
     *  Storage
     */
    address public company;
    PublicOfferingPlan[] public publicOfferingPlans;  // further crowdsales
    mapping(address => uint256) public initialEcTokenAllocation;    // Initial token allocations for Early Contributors
    uint256 public mvpLaunchedAt;  // 0 until a MVP of Starbase Platform launches
    mapping(address => bool) private fundraisers; // Fundraisers are vetted addresses that are allowed to execute functions within the contract

    /*
     *  Constants / Token meta data
     */
    string constant public name = "Starbase";  // Token name
    string constant public symbol = "STAR";  // Token symbol
    uint8 constant public decimals = 18;
    uint256 constant public initialSupply = 1000000000e18; // 1B STAR tokens
    uint256 constant public initialCompanysTokenAllocation = 750000000e18;  // 750M
    uint256 constant public initialBalanceForCrowdsale = 175000000e18;  // CS(125M)+EP(50M)
    uint256 constant public initialBalanceForMarketingCampaign = 12500000e18;   // 12.5M

    /*
     *  Modifiers
     */
    modifier onlyCrowdsaleContract() {
        assert(msg.sender == address(starbaseCrowdsale));
        _;
    }

    modifier onlyMarketingCampaignContract() {
        assert(msg.sender == address(starbaseMarketingCampaign));
        _;
    }

    modifier onlyFundraiser() {
        // Only rightful fundraiser is permitted.
        assert(isFundraiser(msg.sender));
        _;
    }

    modifier onlyBeforeCrowdsale() {
        require(starbaseCrowdsale.startDate() == 0);
        _;
    }

    modifier onlyAfterCrowdsale() {
        require(starbaseCrowdsale.isEnded());
        _;
    }

    /*
     *  Contract functions
     */

    /**
     * @dev Contract constructor function
     * @param starbaseCompanyAddr The address that will holds untransferrable tokens
     * @param starbaseCrowdsaleAddr Address of the crowdsale contract
     * @param starbaseMarketingCampaignAddr The address of the marketing campaign contract
     */

    function StarbaseToken(
        address starbaseCompanyAddr,
        address starbaseCrowdsaleAddr,
        address starbaseMarketingCampaignAddr
    ) {
        assert(
            starbaseCompanyAddr != 0 &&
            starbaseCrowdsaleAddr != 0 &&
            starbaseMarketingCampaignAddr != 0);

        starbaseCrowdsale = AbstractStarbaseCrowdsale(starbaseCrowdsaleAddr);
        starbaseMarketingCampaign = AbstractStarbaseMarketingCampaign(starbaseMarketingCampaignAddr);
        company = starbaseCompanyAddr;

        // msg.sender becomes first fundraiser
        fundraisers[msg.sender] = true;
        LogNewFundraiser(msg.sender, true);

        // Tokens for crowdsale and early purchasers
        balances[address(starbaseCrowdsale)] = initialBalanceForCrowdsale;

        // Tokens for marketing campaign supporters
        balances[address(starbaseMarketingCampaign)] = initialBalanceForMarketingCampaign;

        // Tokens for early contributors, should be allocated by function
        balances[0] = 62500000e18; // 62.5M

        // Starbase company holds untransferrable tokens initially
        balances[starbaseCompanyAddr] = initialCompanysTokenAllocation; // 750M

        totalSupply = initialSupply;    // 1B
    }

    /**
     * @dev Setup function sets external contracts' addresses
     * @param starbaseCrowdsaleAddr Crowdsale contract address.
     * @param starbaseMarketingCampaignAddr Marketing campaign contract address
     */
    function setup(address starbaseCrowdsaleAddr, address starbaseMarketingCampaignAddr)
        external
        onlyFundraiser
        onlyBeforeCrowdsale
        returns (bool)
    {
        require(starbaseCrowdsaleAddr != 0 && starbaseMarketingCampaignAddr != 0);
        assert(balances[address(starbaseCrowdsale)] == initialBalanceForCrowdsale);
        assert(balances[address(starbaseMarketingCampaign)] == initialBalanceForMarketingCampaign);

        // Move the balances to the new ones
        balances[address(starbaseCrowdsale)] = 0;
        balances[address(starbaseMarketingCampaign)] = 0;
        balances[starbaseCrowdsaleAddr] = initialBalanceForCrowdsale;
        balances[starbaseMarketingCampaignAddr] = initialBalanceForMarketingCampaign;

        // Update the references
        starbaseCrowdsale = AbstractStarbaseCrowdsale(starbaseCrowdsaleAddr);
        starbaseMarketingCampaign = AbstractStarbaseMarketingCampaign(starbaseMarketingCampaignAddr);
        return true;
    }

    /*
     *  External functions
     */

    /**
     * @dev Returns number of declared public offering plans
     */
    function numOfDeclaredPublicOfferingPlans()
        external
        constant
        returns (uint256)
    {
        return publicOfferingPlans.length;
    }

    /**
     * @dev Declares a public offering plan to make company's tokens transferable
     * @param tokenCount Number of tokens to transfer.
     * @param unlockCompanysTokensAt Time of the tokens will be unlocked
     */
    function declarePublicOfferingPlan(uint256 tokenCount, uint256 unlockCompanysTokensAt)
        external
        onlyFundraiser
        onlyAfterCrowdsale
        returns (bool)
    {
        assert(tokenCount <= 100000000e18);    // shall not exceed 100M tokens
        assert(SafeMath.sub(now, starbaseCrowdsale.endedAt()) >= 180 days);   // shall not be declared for 6 months after the crowdsale ended
        assert(SafeMath.sub(unlockCompanysTokensAt, now) >= 60 days);   // tokens must be untransferable at least for 2 months

        // check if last declaration was more than 6 months ago
        if (publicOfferingPlans.length > 0) {
            uint256 lastDeclaredAt =
                publicOfferingPlans[publicOfferingPlans.length - 1].declaredAt;
            assert(SafeMath.sub(now, lastDeclaredAt) >= 180 days);
        }

        uint256 totalDeclaredTokenCount = tokenCount;
        for (uint8 i; i < publicOfferingPlans.length; i++) {
            totalDeclaredTokenCount = SafeMath.add(totalDeclaredTokenCount, publicOfferingPlans[i].tokenCount);
        }
        assert(totalDeclaredTokenCount <= initialCompanysTokenAllocation);   // shall not exceed the initial token allocation

        publicOfferingPlans.push(
            PublicOfferingPlan(tokenCount, unlockCompanysTokensAt, now));

        PublicOfferingPlanDeclared(tokenCount, unlockCompanysTokensAt);
    }

    /**
     * @dev Allocate tokens to a marketing supporter from the marketing campaign share
     * @param to Address to where tokens are allocated
     * @param value Number of tokens to transfer
     */
    function allocateToMarketingSupporter(address to, uint256 value)
        external
        onlyMarketingCampaignContract
        returns (bool)
    {
        return allocateFrom(address(starbaseMarketingCampaign), to, value);
    }

    /**
     * @dev Allocate tokens to an early contributor from the early contributor share
     * @param to Address to where tokens are allocated
     * @param value Number of tokens to transfer
     */
    function allocateToEarlyContributor(address to, uint256 value)
        external
        onlyFundraiser
        returns (bool)
    {
        initialEcTokenAllocation[to] =
            SafeMath.add(initialEcTokenAllocation[to], value);
        return allocateFrom(0, to, value);
    }

    /**
     * @dev Issue new tokens according to the STAR token inflation limits
     * @param _for Address to where tokens are allocated
     * @param value Number of tokens to issue
     */
    function issueTokens(address _for, uint256 value)
        external
        onlyFundraiser
        onlyAfterCrowdsale
        returns (bool)
    {
        // check if the value under the limits
        assert(value <= numOfInflatableTokens());

        totalSupply = SafeMath.add(totalSupply, value);
        balances[_for] = SafeMath.add(balances[_for], value);
        return true;
    }

    /**
     * @dev Declares Starbase MVP has been launched
     * @param launchedAt When the MVP launched (timestamp)
     */
    function declareMvpLaunched(uint256 launchedAt)
        external
        onlyFundraiser
        onlyAfterCrowdsale
        returns (bool)
    {
        require(mvpLaunchedAt == 0); // overwriting the launch date is not permitted
        require(launchedAt <= now);
        require(starbaseCrowdsale.isEnded());

        mvpLaunchedAt = launchedAt;
        MvpLaunched(launchedAt);
        return true;
    }

    /**
     * @dev Allocate tokens to a crowdsale or early purchaser from the crowdsale share
     * @param to Address to where tokens are allocated
     * @param value Number of tokens to transfer
     */
    function allocateToCrowdsalePurchaser(address to, uint256 value)
        external
        onlyCrowdsaleContract
        onlyAfterCrowdsale
        returns (bool)
    {
        return allocateFrom(address(starbaseCrowdsale), to, value);
    }

    /*
     *  Public functions
     */

    /**
     * @dev Transfers sender's tokens to a given address. Returns success.
     * @param to Address of token receiver.
     * @param value Number of tokens to transfer.
     */
    function transfer(address to, uint256 value) public returns (bool) {
        assert(isTransferable(msg.sender, value));
        return super.transfer(to, value);
    }

    /**
     * @dev Allows third party to transfer tokens from one address to another. Returns success.
     * @param from Address from where tokens are withdrawn.
     * @param to Address to where tokens are sent.
     * @param value Number of tokens to transfer.
     */
    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        assert(isTransferable(from, value));
        return super.transferFrom(from, to, value);
    }

    /**
     * @dev Adds fundraiser. Only called by another fundraiser.
     * @param fundraiserAddress The address in check
     */
    function addFundraiser(address fundraiserAddress) public onlyFundraiser {
        assert(!isFundraiser(fundraiserAddress));

        fundraisers[fundraiserAddress] = true;
        LogNewFundraiser(fundraiserAddress, true);
    }

    /**
     * @dev Update fundraiser address rights.
     * @param fundraiserAddress The address to update
     * @param isBonaFide Boolean that denotes whether fundraiser is active or not.
     */
    function updateFundraiser(address fundraiserAddress, bool isBonaFide)
       public
       onlyFundraiser
       returns(bool)
    {
        assert(isFundraiser(fundraiserAddress));

        fundraisers[fundraiserAddress] = isBonaFide;
        LogUpdateFundraiser(fundraiserAddress, isBonaFide);
        return true;
    }

    /**
     * @dev Returns whether fundraiser address has rights.
     * @param fundraiserAddress The address in check
     */
    function isFundraiser(address fundraiserAddress) constant public returns(bool) {
        return fundraisers[fundraiserAddress];
    }

    /**
     * @dev Returns whether the transferring of tokens is available fundraiser.
     * @param from Address of token sender
     * @param tokenCount Number of tokens to transfer.
     */
    function isTransferable(address from, uint256 tokenCount)
        constant
        public
        returns (bool)
    {
        if (tokenCount == 0 || balances[from] < tokenCount) {
            return false;
        }

        // company's tokens may be locked up
        if (from == company) {
            if (tokenCount > numOfTransferableCompanysTokens()) {
                return false;
            }
        }

        uint256 untransferableTokenCount = 0;

        // early contributor's tokens may be locked up
        if (initialEcTokenAllocation[from] > 0) {
            untransferableTokenCount = SafeMath.add(
                untransferableTokenCount,
                numOfUntransferableEcTokens(from));
        }

        // EP and CS purchasers' tokens should be untransferable initially
        if (starbaseCrowdsale.isEnded()) {
            uint256 passedDays =
                SafeMath.sub(now, starbaseCrowdsale.endedAt()) / 86400; // 1d = 86400s
            if (passedDays < 7) {  // within a week
                // crowdsale purchasers cannot transfer their tokens for a week
                untransferableTokenCount = SafeMath.add(
                    untransferableTokenCount,
                    starbaseCrowdsale.numOfPurchasedTokensOnCsBy(from));
            }
            if (passedDays < 14) {  // within two weeks
                // early purchasers cannot transfer their tokens for two weeks
                untransferableTokenCount = SafeMath.add(
                    untransferableTokenCount,
                    starbaseCrowdsale.numOfPurchasedTokensOnEpBy(from));
            }
        }

        uint256 transferableTokenCount =
            SafeMath.sub(balances[from], untransferableTokenCount);

        if (transferableTokenCount < tokenCount) {
            return false;
        } else {
            return true;
        }
    }

    /**
     * @dev Returns the number of transferable company's tokens
     */
    function numOfTransferableCompanysTokens() constant public returns (uint256) {
        uint256 unlockedTokens = 0;
        for (uint8 i; i < publicOfferingPlans.length; i++) {
            PublicOfferingPlan memory plan = publicOfferingPlans[i];
            if (plan.unlockCompanysTokensAt <= now) {
                unlockedTokens = SafeMath.add(unlockedTokens, plan.tokenCount);
            }
        }
        return SafeMath.sub(
            balances[company],
            initialCompanysTokenAllocation - unlockedTokens);
    }

    /**
     * @dev Returns the number of untransferable tokens of the early contributor
     * @param _for Address of early contributor to check
     */
    function numOfUntransferableEcTokens(address _for) constant public returns (uint256) {
        uint256 initialCount = initialEcTokenAllocation[_for];
        if (mvpLaunchedAt == 0) {
            return initialCount;
        }

        uint256 passedWeeks = SafeMath.sub(now, mvpLaunchedAt) / 7 days;
        if (passedWeeks <= 52) {    // a year ≈ 52 weeks
            // all tokens should be locked up for a year
            return initialCount;
        }

        // unlock 1/52 tokens every weeks after a year
        uint256 transferableTokenCount = initialCount / 52 * (passedWeeks - 52);
        if (transferableTokenCount >= initialCount) {
            return 0;
        } else {
            return SafeMath.sub(initialCount, transferableTokenCount);
        }
    }

    /**
     * @dev Returns number of tokens which can be issued according to the inflation rules
     */
    function numOfInflatableTokens() constant public returns (uint256) {
        if (starbaseCrowdsale.endedAt() == 0) {
            return 0;
        }
        uint256 passedDays = SafeMath.sub(now, starbaseCrowdsale.endedAt()) / 86400;  // 1d = 60s * 60m * 24h = 86400s
        uint256 passedYears = passedDays * 100 / 36525;    // about 365.25 days in a year
        uint256 inflatedSupply = initialSupply;
        for (uint256 i; i < passedYears; i++) {
            inflatedSupply = SafeMath.add(inflatedSupply, SafeMath.mul(inflatedSupply, 25) / 1000); // 2.5%/y = 0.025/y
        }

        uint256 remainderedDays = passedDays * 100 % 36525 / 100;
        if (remainderedDays > 0) {
            uint256 inflatableTokensOfNextYear =
                SafeMath.mul(inflatedSupply, 25) / 1000;
            inflatedSupply = SafeMath.add(inflatedSupply, SafeMath.mul(
                inflatableTokensOfNextYear, remainderedDays * 100) / 36525);
        }

        return SafeMath.sub(inflatedSupply, totalSupply);
    }

    /*
     *  Internal functions
     */

    /**
     * @dev Allocate tokens value from an address to another one. This function is only called internally.
     * @param from Address from where tokens come
     * @param to Address to where tokens are allocated
     * @param value Number of tokens to transfer
     */
    function allocateFrom(address from, address to, uint256 value) internal returns (bool) {
        assert(value > 0 && balances[from] >= value);
        balances[from] = SafeMath.sub(balances[from], value);
        balances[to] = SafeMath.add(balances[to], value);
        Transfer(from, to, value);
        return true;
    }
}
