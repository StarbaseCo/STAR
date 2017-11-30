pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

import './AbstractStarbaseToken.sol';
import './StarbaseCrowdsale.sol';
import './StarbaseEarlyPurchaseAmendment.sol';

/**
 * @title Starbase Crowdsale Contract Withdrawal contract - Provides an function
          to withdraw STAR token according to crowdsale results
 * @author Starbase PTE. LTD. - <info@starbase.co>
 */
contract StarbaseCrowdsaleContractW is Ownable {
    using SafeMath for uint256;

    /*
     *  Events
     */
    event TokenWithdrawn(address purchaser, uint256 tokenCount);
    event CrowdsalePurchaseBonusLog(
        uint256 purchaseIdx, uint256 rawAmount, uint256 bonus);

    /**
     *  External contracts
     */
    AbstractStarbaseToken public starbaseToken;
    StarbaseCrowdsale public starbaseCrowdsale;
    StarbaseEarlyPurchaseAmendment public starbaseEpAmendment;

    /**
     *  Constants
     */
    uint256 constant public crowdsaleTokenAmount = 125000000e18;
    uint256 constant public earlyPurchaseTokenAmount = 50000000e18;

    /**
     *  Storage
     */

    // early purchase
    address[] public earlyPurchasers;
    mapping (address => uint256) public earlyPurchasedAmountBy; // early purchased amount in CNY per purchasers' address
    bool public earlyPurchasesLoaded = false;  // returns whether all early purchases are loaded into this contract
    uint256 public totalAmountOfEarlyPurchases; // including bonus
    uint public numOfDeliveredEarlyPurchases;  // index to keep the number of early purchases have already been processed by `withdrawPurchasedTokens`
    uint256 public numOfLoadedEarlyPurchases; // index to keep the number of early purchases that have already been loaded by `loadEarlyPurchases`

    // crowdsale
    uint256 public totalAmountOfCrowdsalePurchases; // in CNY, including bonuses
    uint256 public totalAmountOfCrowdsalePurchasesWithoutBonus; // in CNY
    uint256 public startDate;
    uint256 public endedAt;
    mapping (address => uint256) public crowdsalePurchaseAmountBy; // crowdsale purchase amount in CNY per purchasers' address
    uint public numOfDeliveredCrowdsalePurchases;  // index to keep the number of crowdsale purchases have already been processed by `withdrawPurchasedTokens`

    // crowdsale contract withdrawal
    bool public crowdsalePurchasesLoaded = false;   // returns whether all crowdsale purchases are loaded into this contract
    uint256 public numOfLoadedCrowdsalePurchases; // index to keep the number of crowdsale purchases that have already been loaded by `loadCrowdsalePurchases`
    uint256 public totalAmountOfPresalePurchasesWithoutBonus;  // in CNY

    // bonus milestones
    uint256 public firstBonusEnds;
    uint256 public secondBonusEnds;
    uint256 public thirdBonusEnds;
    uint256 public fourthBonusEnds;

    // after the crowdsale
    mapping (address => bool) public tokenWithdrawn;    // returns whether purchased tokens were withdrawn by a purchaser
    mapping (address => uint256) public numOfPurchasedTokensOnCsBy;    // the number of tokens purchased on the crowdsale by a purchaser
    mapping (address => uint256) public numOfPurchasedTokensOnEpBy;    // the number of tokens early purchased by a purchaser

    /**
     *  Modifiers
     */
    modifier whenEnded() {
        assert(isEnded());
        _;
    }

    /**
     * Contract functions
     */

    /**
     * @dev Reject all incoming Ether transfers
     */
    function () { revert(); }

    /**
     * External functions
     */

    /**
     * @dev Setup function sets external contracts' address
     * @param starbaseTokenAddress Token address.
     * @param StarbaseCrowdsaleAddress Token address.
     */
    function setup(address starbaseTokenAddress, address StarbaseCrowdsaleAddress)
        external
        onlyOwner
    {
        require(starbaseTokenAddress != address(0) && StarbaseCrowdsaleAddress != address(0));
        require(address(starbaseToken) == 0 && address(starbaseCrowdsale) == 0);

        starbaseToken = AbstractStarbaseToken(starbaseTokenAddress);
        starbaseCrowdsale = StarbaseCrowdsale(StarbaseCrowdsaleAddress);
        starbaseEpAmendment = StarbaseEarlyPurchaseAmendment(starbaseCrowdsale.starbaseEpAmendment());

        require(starbaseCrowdsale.startDate() > 0);
        startDate = starbaseCrowdsale.startDate();

        require(starbaseCrowdsale.endedAt() > 0);
        endedAt = starbaseCrowdsale.endedAt();
    }

    /**
     * @dev Load crowdsale purchases from the contract keeps track of them
     * @param numOfPresalePurchases Number of presale purchase
     */
    function loadCrowdsalePurchases(uint256 numOfPresalePurchases)
        external
        onlyOwner
        whenEnded
    {
        require(!crowdsalePurchasesLoaded);

        uint256 numOfPurchases = starbaseCrowdsale.numOfPurchases();

        for (uint256 i = numOfLoadedCrowdsalePurchases; i < numOfPurchases && msg.gas > 200000; i++) {
            var (purchaser, amount, rawAmount,) =
                starbaseCrowdsale.crowdsalePurchases(i);

            uint256 bonus;
            if (i < numOfPresalePurchases) {
                bonus = rawAmount * 30 / 100;   // presale: 30% bonus
                totalAmountOfPresalePurchasesWithoutBonus =
                    totalAmountOfPresalePurchasesWithoutBonus.add(rawAmount);
            } else {
                bonus = calculateBonus(rawAmount); // mainsale: 20% ~ 0% bonus
            }

            // Update amount with bonus
            CrowdsalePurchaseBonusLog(i, rawAmount, bonus);
            amount = rawAmount + bonus;

            // Increase the sums
            crowdsalePurchaseAmountBy[purchaser] = SafeMath.add(crowdsalePurchaseAmountBy[purchaser], amount);
            totalAmountOfCrowdsalePurchases = totalAmountOfCrowdsalePurchases.add(amount);
            totalAmountOfCrowdsalePurchasesWithoutBonus = totalAmountOfCrowdsalePurchasesWithoutBonus.add(rawAmount);

            numOfLoadedCrowdsalePurchases++;    // Increase the index
        }

        assert(numOfLoadedCrowdsalePurchases <= numOfPurchases);
        if (numOfLoadedCrowdsalePurchases == numOfPurchases) {
            crowdsalePurchasesLoaded = true;    // enable the flag
        }
    }

    /**
     * @dev Add early purchases
     */
    function addEarlyPurchases() external onlyOwner returns (bool) {
        if (earlyPurchasesLoaded) {
            return false;    // all EPs have already been loaded
        }

        uint256 numOfOrigEp = starbaseEpAmendment
            .starbaseEarlyPurchase()
            .numberOfEarlyPurchases();

        for (uint256 i = numOfLoadedEarlyPurchases; i < numOfOrigEp && msg.gas > 200000; i++) {
            if (starbaseEpAmendment.isInvalidEarlyPurchase(i)) {
                numOfLoadedEarlyPurchases = SafeMath.add(numOfLoadedEarlyPurchases, 1);
                continue;
            }
            var (purchaser, amount,) =
                starbaseEpAmendment.isAmendedEarlyPurchase(i)
                ? starbaseEpAmendment.amendedEarlyPurchases(i)
                : starbaseEpAmendment.earlyPurchases(i);
            if (amount > 0) {
                if (earlyPurchasedAmountBy[purchaser] == 0) {
                    earlyPurchasers.push(purchaser);
                }
                // each early purchaser receives 10% bonus
                uint256 bonus = SafeMath.mul(amount, 10) / 100;
                uint256 amountWithBonus = SafeMath.add(amount, bonus);

                earlyPurchasedAmountBy[purchaser] = SafeMath.add(earlyPurchasedAmountBy[purchaser], amountWithBonus);
                totalAmountOfEarlyPurchases = totalAmountOfEarlyPurchases.add(amountWithBonus);
            }

            numOfLoadedEarlyPurchases = SafeMath.add(numOfLoadedEarlyPurchases, 1);
        }

        assert(numOfLoadedEarlyPurchases <= numOfOrigEp);
        if (numOfLoadedEarlyPurchases == numOfOrigEp) {
            earlyPurchasesLoaded = true;    // enable the flag
        }

        return true;
    }

    /**
     * @dev Deliver tokens to purchasers according to their purchase amount in CNY
     */
    function withdrawPurchasedTokens()
        external
        whenEnded
    {
        require(crowdsalePurchasesLoaded);
        assert(earlyPurchasesLoaded);
        assert(address(starbaseToken) != 0);

        // prevent double withdrawal
        require(!tokenWithdrawn[msg.sender]);
        tokenWithdrawn[msg.sender] = true;

        /*
         * “Value” refers to the contribution of the User:
         *  {crowdsale_purchaser_token_amount} =
         *  {crowdsale_token_amount} * {crowdsalePurchase_value} / {earlypurchase_value} + {crowdsale_value}.
         *
         * Example: If a User contributes during the Contribution Period 100 CNY (including applicable
         * Bonus, if any) and the total amount early purchases amounts to 6’000’000 CNY
         * and total amount raised during the Contribution Period is 30’000’000, then he will get
         * 347.22 STAR = 125’000’000 STAR * 100 CNY / 30’000’000 CNY + 6’000’000 CNY.
        */

        if (crowdsalePurchaseAmountBy[msg.sender] > 0) {
            uint256 crowdsalePurchaseValue = crowdsalePurchaseAmountBy[msg.sender];
            uint256 tokenCount =
                SafeMath.mul(crowdsaleTokenAmount, crowdsalePurchaseValue) /
                totalRaisedAmountInCny();

            numOfPurchasedTokensOnCsBy[msg.sender] =
                SafeMath.add(numOfPurchasedTokensOnCsBy[msg.sender], tokenCount);
            assert(starbaseToken.allocateToCrowdsalePurchaser(msg.sender, tokenCount));
            numOfDeliveredCrowdsalePurchases++;
            TokenWithdrawn(msg.sender, tokenCount);
        }

        /*
         * “Value” refers to the contribution of the User:
         * {earlypurchaser_token_amount} =
         * {earlypurchaser_token_amount} * ({earlypurchase_value} / {total_earlypurchase_value})
         *  + {crowdsale_token_amount} * ({earlypurchase_value} / {earlypurchase_value} + {crowdsale_value}).
         *
         * Example: If an Early Purchaser contributes 100 CNY (including Bonus) and the
         * total amount of early purchases amounts to 6’000’000 CNY and the total amount raised
         * during the Contribution Period is 30’000’000 CNY, then he will get 1180.55 STAR =
         * 50’000’000 STAR * 100 CNY / 6’000’000 CNY + 125’000’000 STAR * 100 CNY /
         * 30’000’000 CNY + 6’000’000 CNY
         */

        if (earlyPurchasedAmountBy[msg.sender] > 0) {  // skip if is not an early purchaser
            uint256 earlyPurchaserPurchaseValue = earlyPurchasedAmountBy[msg.sender];
            uint256 epTokenCalculationFromEPTokenAmount = SafeMath.mul(earlyPurchaseTokenAmount, earlyPurchaserPurchaseValue) / totalAmountOfEarlyPurchases;
            uint256 epTokenCalculationFromCrowdsaleTokenAmount = SafeMath.mul(crowdsaleTokenAmount, earlyPurchaserPurchaseValue) / totalRaisedAmountInCny();
            uint256 epTokenCount = SafeMath.add(epTokenCalculationFromEPTokenAmount, epTokenCalculationFromCrowdsaleTokenAmount);

            numOfPurchasedTokensOnEpBy[msg.sender] = SafeMath.add(numOfPurchasedTokensOnEpBy[msg.sender], epTokenCount);
            assert(starbaseToken.allocateToCrowdsalePurchaser(msg.sender, epTokenCount));
            numOfDeliveredEarlyPurchases++;
            TokenWithdrawn(msg.sender, epTokenCount);
        }
    }

    /**
     * Public functions
     */

    /**
     * @dev Returns boolean for whether crowdsale has ended
     */
    function isEnded() constant public returns (bool) {
        return (starbaseCrowdsale != address(0) && endedAt > 0);
    }

    /**
     * @dev Returns total raised amount in CNY (includes EP) and bonuses
     */
    function totalRaisedAmountInCny() constant public returns (uint256) {
        return totalAmountOfEarlyPurchases.add(totalAmountOfCrowdsalePurchases);
    }

    /**
     * Internal functions
     */

    /**
     * @dev Calculates bonus of a purchase
     */
    function calculateBonus(uint256 rawAmount)
        internal
        returns (uint256 bonus)
    {
        uint256 purchasedAmount =
            totalAmountOfCrowdsalePurchasesWithoutBonus
                .sub(totalAmountOfPresalePurchasesWithoutBonus);
        uint256 e1 = starbaseCrowdsale.firstBonusEnds();
        uint256 e2 = starbaseCrowdsale.secondBonusEnds();
        uint256 e3 = starbaseCrowdsale.thirdBonusEnds();
        uint256 e4 = starbaseCrowdsale.fourthBonusEnds();
        return calculateBonusInRange(purchasedAmount, rawAmount, 0, e1, 20)
            .add(calculateBonusInRange(purchasedAmount, rawAmount, e1, e2, 15))
            .add(calculateBonusInRange(purchasedAmount, rawAmount, e2, e3, 10))
            .add(calculateBonusInRange(purchasedAmount, rawAmount, e3, e4, 5));
    }

    function calculateBonusInRange(
        uint256 purchasedAmount,
        uint256 rawAmount,
        uint256 bonusBegin,
        uint256 bonusEnd,
        uint256 bonusTier
    )
        public
        constant
        returns (uint256 bonus)
    {
        uint256 sum = purchasedAmount + rawAmount;
        if (purchasedAmount > bonusEnd || sum < bonusBegin) {
            return 0;   // out of this range
        }

        uint256 min = purchasedAmount <= bonusBegin ? bonusBegin : purchasedAmount;
        uint256 max = bonusEnd <= sum ? bonusEnd : sum;
        return max.sub(min) * bonusTier / 100;
    }
}
