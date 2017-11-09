pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

import './AbstractStarbaseToken.sol';
import './StarbaseEarlyPurchaseAmendment.sol';
import './Certifier.sol';

/**
 * @title Crowdsale contract - Starbase crowdsale to create STAR.
 * @author Starbase PTE. LTD. - <info@starbase.co>
 */
contract StarbaseCrowdsale is Ownable {
    using SafeMath for uint256;
    /*
     *  Events
     */
    event CrowdsaleEnded(uint256 endedAt);
    event StarbasePurchasedWithEth(address purchaser, uint256 amount, uint256 rawAmount, uint256 cnyEthRate);
    event CnyEthRateUpdated(uint256 cnyEthRate);
    event CnyBtcRateUpdated(uint256 cnyBtcRate);
    event QualifiedPartnerAddress(address qualifiedPartner);

    /**
     *  External contracts
     */
    AbstractStarbaseToken public starbaseToken;
    StarbaseEarlyPurchaseAmendment public starbaseEpAmendment;
    Certifier public picopsCertifier;

    /**
     *  Constants
     */
    uint256 constant public crowdsaleTokenAmount = 125000000e18;
    uint256 constant public earlyPurchaseTokenAmount = 50000000e18;
    uint256 constant public MIN_INVESTMENT = 1; // min is 1 Wei
    uint256 constant public MAX_CAP = 67000000; // in CNY. approximately 10M USD. (includes raised amount from both EP and CS)
    string public constant PURCHASE_AMOUNT_UNIT = 'CNY';  // Chinese Yuan

    /**
     * Types
     */
    struct CrowdsalePurchase {
        address purchaser;
        uint256 amount;        // CNY based amount with bonus
        uint256 rawAmount;     // CNY based amount no bonus
        uint256 purchasedAt;   // timestamp
    }

    struct QualifiedPartners {
        uint256 amountCap;
        uint256 amountRaised;
        bool    bonaFide;
        uint256 commissionFeePercentage; // example 5 will calculate the percentage as 5%
    }

    /*
     *  Enums
     */
    enum BonusMilestones {
        First,
        Second,
        Third,
        Fourth,
        Fifth
    }

    // Initialize bonusMilestones
    BonusMilestones public bonusMilestones = BonusMilestones.First;

    /**
     *  Storage
     */
    uint public numOfDeliveredCrowdsalePurchases;  // index to keep the number of crowdsale purchases have already been processed by `withdrawPurchasedTokens`
    uint public numOfDeliveredEarlyPurchases;  // index to keep the number of early purchases have already been processed by `withdrawPurchasedTokens`
    uint256 public numOfLoadedEarlyPurchases; // index to keep the number of early purchases that have already been loaded by `loadEarlyPurchases`

    // early purchase
    address[] public earlyPurchasers;
    mapping (address => uint256) public earlyPurchasedAmountBy; // early purchased amount in CNY per purchasers' address
    bool public earlyPurchasesLoaded = false;  // returns whether all early purchases are loaded into this contract
    uint256 public totalAmountOfEarlyPurchases; // including 20% bonus

    // crowdsale
    bool public presalePurchasesLoaded = false; // returns whether all presale purchases are loaded into this contract
    uint256 public maxCrowdsaleCap;     // = 67M CNY - (total raised amount from EP)
    uint256 public totalAmountOfCrowdsalePurchases; // in CNY, including bonuses
    uint256 public totalAmountOfCrowdsalePurchasesWithoutBonus; // in CNY
    mapping (address => QualifiedPartners) public qualifiedPartners;
    uint256 public purchaseStartBlock;  // crowdsale purchases can be accepted from this block number
    uint256 public startDate;
    uint256 public endedAt;
    CrowdsalePurchase[] public crowdsalePurchases;
    mapping (address => uint256) public crowdsalePurchaseAmountBy; // crowdsale purchase amount in CNY per purchasers' address
    uint256 public cnyBtcRate; // this rate won't be used from a smart contract function but external system
    uint256 public cnyEthRate;

    // bonus milestones
    uint256 public firstBonusEnds;
    uint256 public secondBonusEnds;
    uint256 public thirdBonusEnds;
    uint256 public fourthBonusEnds;

    // after the crowdsale
    mapping (address => uint256) public numOfPurchasedTokensOnCsBy;    // the number of tokens purchased on the crowdsale by a purchaser
    mapping (address => uint256) public numOfPurchasedTokensOnEpBy;    // the number of tokens early purchased by a purchaser

    /**
     *  Modifiers
     */
    modifier minInvestment() {
        // User has to send at least the ether value of one token.
        assert(msg.value >= MIN_INVESTMENT);
        _;
    }

    modifier whenNotStarted() {
        assert(startDate == 0);
        _;
    }

    modifier whenEnded() {
        assert(isEnded());
        _;
    }

    modifier hasBalance() {
        assert(this.balance > 0);
        _;
    }
    modifier rateIsSet(uint256 _rate) {
        assert(_rate != 0);
        _;
    }

    modifier whenNotEnded() {
        assert(!isEnded());
        _;
    }

    modifier tokensNotDelivered() {
        assert(numOfDeliveredCrowdsalePurchases == 0);
        assert(numOfDeliveredEarlyPurchases == 0);
        _;
    }

    modifier onlyFundraiser() {
        assert(address(starbaseToken) != 0);
        assert(starbaseToken.isFundraiser(msg.sender));
        _;
    }

    modifier onlyQualifiedPartner() {
        assert(qualifiedPartners[msg.sender].bonaFide);
        _;
    }

    modifier onlyQualifiedPartnerORPicopsCertified() {
        assert(qualifiedPartners[msg.sender].bonaFide || picopsCertifier.certified(msg.sender));
        _;
    }

    /**
     * Contract functions
     */
    /**
     * @dev Contract constructor function sets owner address and
     *      address of StarbaseEarlyPurchaseAmendment contract.
     * @param starbaseEpAddr The address that holds the early purchasers Star tokens
     * @param picopsCertifierAddr The address of the PICOPS certifier.
     *                            See also https://picops.parity.io/#/details
     */
    function StarbaseCrowdsale(address starbaseEpAddr, address picopsCertifierAddr) {
        require(starbaseEpAddr != 0 && picopsCertifierAddr != 0);
        owner = msg.sender;
        starbaseEpAmendment = StarbaseEarlyPurchaseAmendment(starbaseEpAddr);
        picopsCertifier = Certifier(picopsCertifierAddr);
    }

    /**
     * @dev Fallback accepts payment for Star tokens with Eth
     */
    function() payable {
        redirectToPurchase();
    }

    /**
     * External functions
     */

    /**
     * @dev Setup function sets external contracts' addresses and set the max crowdsale cap
     * @param starbaseTokenAddress Token address.
     * @param _purchaseStartBlock Block number to start crowdsale
     */
    function setup(address starbaseTokenAddress, uint256 _purchaseStartBlock)
        external
        onlyOwner
        returns (bool)
    {
        require(starbaseTokenAddress != address(0));
        require(address(starbaseToken) == 0);
        starbaseToken = AbstractStarbaseToken(starbaseTokenAddress);
        purchaseStartBlock = _purchaseStartBlock;

        // set the max cap of this crowdsale
        maxCrowdsaleCap = MAX_CAP.sub(totalAmountOfEarlyPurchasesWithoutBonus());

        assert(maxCrowdsaleCap > 0);

        return true;
    }

    /**
     * @dev Transfers raised funds to company's wallet address at any given time.
     */
    function withdrawForCompany()
        external
        onlyFundraiser
        hasBalance
    {
        address company = starbaseToken.company();
        require(company != address(0));
        company.transfer(this.balance);
    }

    /**
     * @dev Update start block Number for the crowdsale
     */
    function updatePurchaseStartBlock(uint256 _purchaseStartBlock)
        external
        whenNotStarted
        onlyFundraiser
        returns (bool)
    {
        purchaseStartBlock = _purchaseStartBlock;
        return true;
    }

    /**
     * @dev Update the CNY/ETH rate to record purchases in CNY
     */
    function updateCnyEthRate(uint256 rate)
        external
        onlyFundraiser
        returns (bool)
    {
        cnyEthRate = rate;
        CnyEthRateUpdated(cnyEthRate);
        return true;
    }

    /**
     * @dev Update the CNY/BTC rate to record purchases in CNY
     */
    function updateCnyBtcRate(uint256 rate)
        external
        onlyFundraiser
        returns (bool)
    {
        cnyBtcRate = rate;
        CnyBtcRateUpdated(cnyBtcRate);
        return true;
    }

    /**
     * @dev Allow for the possibility for contract owner to start crowdsale
     */
    function ownerStartsCrowdsale(uint256 timestamp)
        external
        whenNotStarted
        onlyOwner
    {
        assert(block.number >= purchaseStartBlock);   // this should be after the crowdsale start block
        startCrowdsale(timestamp);
    }

    /**
     * @dev Ends crowdsale
     *      This may be executed by an owner if the raised funds did not reach the map cap
     * @param timestamp Timestamp at the crowdsale ended
     */
    function endCrowdsale(uint256 timestamp)
        external
        onlyOwner
    {
        assert(timestamp > 0 && timestamp <= now);
        assert(block.number >= purchaseStartBlock && endedAt == 0);   // cannot end before it starts and overwriting time is not permitted
        endedAt = timestamp;
        CrowdsaleEnded(endedAt);
    }

    /**
     * @dev Ends crowdsale
     *      This may be executed by purchaseWithEth when the raised funds reach the map cap
     */
    function endCrowdsale() internal {
        assert(block.number >= purchaseStartBlock && endedAt == 0);
        endedAt = now;
        CrowdsaleEnded(endedAt);
    }

    /**
     * @dev Deliver tokens to purchasers according to their purchase amount in CNY
     */
    function withdrawPurchasedTokens()
        external
        whenEnded
        returns (bool)
    {
        assert(earlyPurchasesLoaded);
        assert(address(starbaseToken) != 0);

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
            crowdsalePurchaseAmountBy[msg.sender] = 0;

            uint256 tokenCount =
                SafeMath.mul(crowdsaleTokenAmount, crowdsalePurchaseValue) /
                totalRaisedAmountInCny();

            numOfPurchasedTokensOnCsBy[msg.sender] =
                SafeMath.add(numOfPurchasedTokensOnCsBy[msg.sender], tokenCount);
            assert(starbaseToken.allocateToCrowdsalePurchaser(msg.sender, tokenCount));
            numOfDeliveredCrowdsalePurchases++;
        }

        /*
         * “Value” refers to the contribution of the User:
         * {earlypurchaser_token_amount} =
         * {earlypurchaser_token_amount} * ({earlypurchase_value} / {total_earlypurchase_value})
         *  + {crowdsale_token_amount} * ({earlypurchase_value} / {earlypurchase_value} + {crowdsale_value}).
         *
         * Example: If an Early Purchaser contributes 100 CNY (including Bonus of 20%) and the
         * total amount of early purchases amounts to 6’000’000 CNY and the total amount raised
         * during the Contribution Period is 30’000’000 CNY, then he will get 1180.55 STAR =
         * 50’000’000 STAR * 100 CNY / 6’000’000 CNY + 125’000’000 STAR * 100 CNY /
         * 30’000’000 CNY + 6’000’000 CNY
         */

        if (earlyPurchasedAmountBy[msg.sender] > 0) {  // skip if is not an early purchaser
            uint256 earlyPurchaserPurchaseValue = earlyPurchasedAmountBy[msg.sender];
            earlyPurchasedAmountBy[msg.sender] = 0;

            uint256 epTokenCalculationFromEPTokenAmount = SafeMath.mul(earlyPurchaseTokenAmount, earlyPurchaserPurchaseValue) / totalAmountOfEarlyPurchases;

            uint256 epTokenCalculationFromCrowdsaleTokenAmount = SafeMath.mul(crowdsaleTokenAmount, earlyPurchaserPurchaseValue) / totalRaisedAmountInCny();

            uint256 epTokenCount = SafeMath.add(epTokenCalculationFromEPTokenAmount, epTokenCalculationFromCrowdsaleTokenAmount);

            numOfPurchasedTokensOnEpBy[msg.sender] = SafeMath.add(numOfPurchasedTokensOnEpBy[msg.sender], epTokenCount);
            assert(starbaseToken.allocateToCrowdsalePurchaser(msg.sender, epTokenCount));
            numOfDeliveredEarlyPurchases++;
        }

        return true;
    }

    /**
     * @dev Load early purchases from the contract keeps track of them
     */
    function loadEarlyPurchases() external onlyOwner returns (bool) {
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
                // each early purchaser receives 20% bonus
                uint256 bonus = SafeMath.mul(amount, 20) / 100;
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
     * @dev Load presale purchases from the contract keeps track of them
     * @param starbaseCrowdsalePresale Starbase presale contract address
     */
    function loadPresalePurchases(address starbaseCrowdsalePresale)
        external
        onlyOwner
        whenNotEnded
    {
        require(starbaseCrowdsalePresale != 0);
        require(!presalePurchasesLoaded);
        StarbaseCrowdsale presale = StarbaseCrowdsale(starbaseCrowdsalePresale);
        for (uint i; i < presale.numOfPurchases(); i++) {
            var (purchaser, amount, rawAmount, purchasedAt) =
                presale.crowdsalePurchases(i);  // presale purchase
            crowdsalePurchases.push(CrowdsalePurchase(purchaser, amount, rawAmount, purchasedAt));

            // Increase the sums
            crowdsalePurchaseAmountBy[purchaser] = SafeMath.add(crowdsalePurchaseAmountBy[purchaser], amount);
            totalAmountOfCrowdsalePurchases = totalAmountOfCrowdsalePurchases.add(amount);
            totalAmountOfCrowdsalePurchasesWithoutBonus = totalAmountOfCrowdsalePurchasesWithoutBonus.add(rawAmount);
        }
        presalePurchasesLoaded = true;
    }

    /**
      * @dev Set qualified crowdsale partner i.e. Bitcoin Suisse address
      * @param _qualifiedPartner Address of the qualified partner that can purchase during crowdsale
      * @param _amountCap Ether value which partner is able to contribute
      * @param _commissionFeePercentage Integer that represents the fee to pay qualified partner 5 is 5%
      */
    function setQualifiedPartner(address _qualifiedPartner, uint256 _amountCap, uint256 _commissionFeePercentage)
        external
        onlyOwner
    {
        assert(!qualifiedPartners[_qualifiedPartner].bonaFide);
        qualifiedPartners[_qualifiedPartner].bonaFide = true;
        qualifiedPartners[_qualifiedPartner].amountCap = _amountCap;
        qualifiedPartners[_qualifiedPartner].commissionFeePercentage = _commissionFeePercentage;
        QualifiedPartnerAddress(_qualifiedPartner);
    }

    /**
     * @dev Remove address from qualified partners list.
     * @param _qualifiedPartner Address to be removed from the list.
     */
    function unlistQualifiedPartner(address _qualifiedPartner) external onlyOwner {
        assert(qualifiedPartners[_qualifiedPartner].bonaFide);
        qualifiedPartners[_qualifiedPartner].bonaFide = false;
    }

    /**
     * @dev Update whitelisted address amount allowed to raise during the presale.
     * @param _qualifiedPartner Qualified Partner address to be updated.
     * @param _amountCap Amount that the address is able to raise during the presale.
     */
    function updateQualifiedPartnerCapAmount(address _qualifiedPartner, uint256 _amountCap) external onlyOwner {
        assert(qualifiedPartners[_qualifiedPartner].bonaFide);
        qualifiedPartners[_qualifiedPartner].amountCap = _amountCap;
    }

    /**
     * Public functions
     */

    /**
     * @dev Returns boolean for whether crowdsale has ended
     */
    function isEnded() constant public returns (bool) {
        return (endedAt > 0 && endedAt <= now);
    }

    /**
     * @dev Returns number of purchases to date.
     */
    function numOfPurchases() constant public returns (uint256) {
        return crowdsalePurchases.length;
    }

    /**
     * @dev Returns total raised amount in CNY (includes EP) and bonuses
     */
    function totalRaisedAmountInCny() constant public returns (uint256) {
        return totalAmountOfEarlyPurchases.add(totalAmountOfCrowdsalePurchases);
    }

    /**
     * @dev Returns total amount of early purchases in CNY and bonuses
     */
    function totalAmountOfEarlyPurchasesWithBonus() constant public returns(uint256) {
       return starbaseEpAmendment.totalAmountOfEarlyPurchases().mul(120).div(100);
    }

    /**
     * @dev Returns total amount of early purchases in CNY
     */
    function totalAmountOfEarlyPurchasesWithoutBonus() constant public returns(uint256) {
       return starbaseEpAmendment.totalAmountOfEarlyPurchases();
    }

    /**
     * @dev Allows qualified crowdsale partner to purchase Star Tokens
     */
    function purchaseAsQualifiedPartner()
        payable
        public
        rateIsSet(cnyEthRate)
        onlyQualifiedPartner
        returns (bool)
    {
        require(msg.value > 0);
        qualifiedPartners[msg.sender].amountRaised = SafeMath.add(msg.value, qualifiedPartners[msg.sender].amountRaised);

        assert(qualifiedPartners[msg.sender].amountRaised <= qualifiedPartners[msg.sender].amountCap);

        uint256 rawAmount = SafeMath.mul(msg.value, cnyEthRate) / 1e18;
        recordPurchase(msg.sender, rawAmount, now);

        if (qualifiedPartners[msg.sender].commissionFeePercentage > 0) {
            sendQualifiedPartnerCommissionFee(msg.sender, msg.value);
        }

        return true;
    }

    /**
     * @dev Allows user to purchase STAR tokens with Ether
     */
    function purchaseWithEth()
        payable
        public
        minInvestment
        whenNotEnded
        rateIsSet(cnyEthRate)
        onlyQualifiedPartnerORPicopsCertified
        returns (bool)
    {
        require(purchaseStartBlock > 0 && block.number >= purchaseStartBlock);

        if (startDate == 0) {
            startCrowdsale(block.timestamp);
        }

        uint256 rawAmount = SafeMath.mul(msg.value, cnyEthRate) / 1e18;
        recordPurchase(msg.sender, rawAmount, now);

        if (totalAmountOfCrowdsalePurchasesWithoutBonus >= maxCrowdsaleCap) {
            endCrowdsale(); // ends this crowdsale automatically
        }

        return true;
    }

    /**
     * Internal functions
     */

    /**
     * @dev Initializes Starbase crowdsale
     */
    function startCrowdsale(uint256 timestamp) internal {
        startDate = timestamp;
        uint256 presaleAmount = totalAmountOfCrowdsalePurchasesWithoutBonus;
        if (maxCrowdsaleCap > presaleAmount) {
            uint256 mainSaleCap = maxCrowdsaleCap.sub(presaleAmount);
            uint256 twentyPercentOfCrowdsalePurchase = mainSaleCap.mul(20).div(100);

            // set token bonus milestones in cny total crowdsale purchase
            firstBonusEnds =  twentyPercentOfCrowdsalePurchase;
            secondBonusEnds = firstBonusEnds.add(twentyPercentOfCrowdsalePurchase);
            thirdBonusEnds =  secondBonusEnds.add(twentyPercentOfCrowdsalePurchase);
            fourthBonusEnds = thirdBonusEnds.add(twentyPercentOfCrowdsalePurchase);
        }
    }

    /**
     * @dev Abstract record of a purchase to Tokens
     * @param purchaser Address of the buyer
     * @param rawAmount Amount in CNY as per the CNY/ETH rate used
     * @param timestamp Timestamp at the purchase made
     */
    function recordPurchase(
        address purchaser,
        uint256 rawAmount,
        uint256 timestamp
    )
        internal
        returns(uint256 amount)
    {
        amount = rawAmount; // amount to check reach of max cap. it does not care for bonus tokens here

        // presale transfers which occurs before the crowdsale ignores the crowdsale hard cap
        if (block.number >= purchaseStartBlock) {
            require(totalAmountOfCrowdsalePurchasesWithoutBonus < maxCrowdsaleCap);   // check if the amount has already reached the cap

            uint256 crowdsaleTotalAmountAfterPurchase =
                SafeMath.add(totalAmountOfCrowdsalePurchasesWithoutBonus, amount);

            // check whether purchase goes over the cap and send the difference back to the purchaser.
            if (crowdsaleTotalAmountAfterPurchase > maxCrowdsaleCap) {
              uint256 difference = SafeMath.sub(crowdsaleTotalAmountAfterPurchase, maxCrowdsaleCap);
              uint256 ethValueToReturn = SafeMath.mul(difference, 1e18) / cnyEthRate;
              purchaser.transfer(ethValueToReturn);
              amount = SafeMath.sub(amount, difference);
              rawAmount = amount;
            }
        }

        amount = getBonusAmountCalculation(amount); // at this point amount bonus is calculated

        CrowdsalePurchase memory purchase = CrowdsalePurchase(purchaser, amount, rawAmount, timestamp);
        crowdsalePurchases.push(purchase);
        StarbasePurchasedWithEth(msg.sender, amount, rawAmount, cnyEthRate);
        crowdsalePurchaseAmountBy[purchaser] = SafeMath.add(crowdsalePurchaseAmountBy[purchaser], amount);
        totalAmountOfCrowdsalePurchases = totalAmountOfCrowdsalePurchases.add(amount);
        totalAmountOfCrowdsalePurchasesWithoutBonus = totalAmountOfCrowdsalePurchasesWithoutBonus.add(rawAmount);
        return amount;
    }

    /**
     * @dev Calculates amount with bonus for bonus milestones
     */
    function calculateBonus
        (
            BonusMilestones nextMilestone,
            uint256 amount,
            uint256 bonusRange,
            uint256 bonusTier,
            uint256 results
        )
        internal
        returns (uint256 result, uint256 newAmount)
    {
        uint256 bonusCalc;

        if (amount <= bonusRange) {
            bonusCalc = amount.mul(bonusTier).div(100);

            if (amount.add(totalAmountOfCrowdsalePurchasesWithoutBonus) >= bonusRange)
                bonusMilestones = nextMilestone;

            result = results.add(amount).add(bonusCalc);
            newAmount = 0;

        } else {
            bonusCalc = bonusRange.mul(bonusTier).div(100);
            bonusMilestones = nextMilestone;
            result = results.add(bonusRange).add(bonusCalc);
            newAmount = amount.sub(bonusRange);
        }
    }

    /**
     * @dev Fetchs Bonus tier percentage per bonus milestones
     */
    function getBonusAmountCalculation(uint256 amount) internal returns (uint256) {
        if (block.number < purchaseStartBlock) {
            uint256 bonusFromAmount = amount.mul(30).div(100); // presale has 30% bonus
            return amount.add(bonusFromAmount);
        }

        // range of each bonus milestones
        uint256 firstBonusRange = firstBonusEnds;
        uint256 secondBonusRange = secondBonusEnds.sub(firstBonusEnds);
        uint256 thirdBonusRange = thirdBonusEnds.sub(secondBonusEnds);
        uint256 fourthBonusRange = fourthBonusEnds.sub(thirdBonusEnds);
        uint256 result;

        if (bonusMilestones == BonusMilestones.First)
            (result, amount) = calculateBonus(BonusMilestones.Second, amount, firstBonusRange, 20, result);

        if (bonusMilestones == BonusMilestones.Second)
            (result, amount) = calculateBonus(BonusMilestones.Third, amount, secondBonusRange, 15, result);

        if (bonusMilestones == BonusMilestones.Third)
            (result, amount) = calculateBonus(BonusMilestones.Fourth, amount, thirdBonusRange, 10, result);

        if (bonusMilestones == BonusMilestones.Fourth)
            (result, amount) = calculateBonus(BonusMilestones.Fifth, amount, fourthBonusRange, 5, result);

        return result.add(amount);
    }

    /**
     * @dev Fetchs Bonus tier percentage per bonus milestones
     * @dev qualifiedPartner Address of partners that participated in pre sale
     * @dev amountSent Value sent by qualified partner
     */
    function sendQualifiedPartnerCommissionFee(address qualifiedPartner, uint256 amountSent) internal {
        //calculate the commission fee to send to qualified partner
        uint256 commissionFeePercentageCalculationAmount = SafeMath.mul(amountSent, qualifiedPartners[qualifiedPartner].commissionFeePercentage) / 100;

        // send commission fee amount
        qualifiedPartner.transfer(commissionFeePercentageCalculationAmount);
    }

    /**
     * @dev redirectToPurchase Redirect to adequate purchase function within the smart contract
     */
    function redirectToPurchase() internal {
        if (block.number < purchaseStartBlock) {
            purchaseAsQualifiedPartner();
        } else {
            purchaseWithEth();
        }
    }
}
