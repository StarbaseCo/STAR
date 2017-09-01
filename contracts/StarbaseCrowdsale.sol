pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

import './AbstractStarbaseToken.sol';
import './StarbaseEarlyPurchaseAmendment.sol';

/**
 * @title Crowdsale contract - Starbase crowdsale to create STAR.
 * @author Starbase PTE. LTD. - <info@starbase.co>
 */
contract StarbaseCrowdsale is Ownable {
    /*
     *  Events
     */
    event CrowdsaleEnded(uint256 endedAt);
    event StarBasePurchasedWithEth(address purchaser, uint256 amount, uint256 rawAmount, uint256 cnyEthRate, uint256 bonusTokensPercentage);
    event StarBasePurchasedOffChain(address purchaser, uint256 amount, uint256 rawAmount, uint256 cnyBtcRate, uint256 bonusTokensPercentage, string data);
    event CnyEthRateUpdated(uint256 cnyEthRate);
    event CnyBtcRateUpdated(uint256 cnyBtcRate);
    event QualifiedPartnerAddress(address qualifiedPartner);
    event PurchaseInvalidated(uint256 purchaseIdx);
    event PurchaseAmended(uint256 purchaseIdx);

    /**
     *  External contracts
     */
    AbstractStarbaseToken public starbaseToken;
    StarbaseEarlyPurchaseAmendment public starbaseEpAmendment;

    /**
     *  Constants
     */
    uint256 constant public crowdsaleTokenAmount = 125000000e18;
    uint256 constant public earlyPurchaseTokenAmount = 50000000e18;
    uint256 constant public MIN_INVESTMENT = 1; // min is 1 Wei
    uint256 constant public MAX_CROWDSALE_CAP = 60000000; // approximately 9M USD for the crowdsale(CS). 1M (by EP) + 9M (by CS) = 10M (Total)
    string public constant PURCHASE_AMOUNT_UNIT = 'CNY';  // Chinese Yuan

    /**
     * Types
     */
    struct CrowdsalePurchase {
        address purchaser;
        uint256 amount;        // CNY based amount with bonus
        uint256 rawAmount;     // CNY based amount no bonus
        uint256 purchasedAt;   // timestamp
        string data;           // additional data (e.g. Tx ID of Bitcoin)
        uint256 bonus;
    }

    struct QualifiedPartners {
        uint256 amountCap;
        uint256 amountRaised;
        bool    bonaFide;
        uint256 commissionFeePercentage; // example 5 will calculate the percentage as 5%
    }

    /**
     *  Storage
     */
    address public workshop; // holds undelivered STARs

    uint public numOfDeliveredCrowdsalePurchases = 0;  // index to keep the number of crowdsale purchases have already been processed by `deliverPurchasedTokens`
    uint public numOfDeliveredEarlyPurchases = 0;  // index to keep the number of early purchases have already been processed by `deliverPurchasedTokens`
    uint256 public numOfLoadedEarlyPurchases = 0; // index to keep the number of early purchases that have already been loaded by `loadEarlyPurchases`

    address[] public earlyPurchasers;
    mapping (address => QualifiedPartners) public qualifiedPartners;
    mapping (address => uint256) public earlyPurchasedAmountBy; // early purchased amount in CNY per purchasers' address
    bool public earlyPurchasesLoaded = false;  // returns whether all early purchases are loaded into this contract

    // crowdsale
    uint256 public purchaseStartBlock;  // crowdsale purchases can be accepted from this block number
    uint256 public startDate;
    uint256 public endedAt;
    CrowdsalePurchase[] public crowdsalePurchases;
    uint256 public cnyBtcRate; // this rate won't be used from a smart contract function but external system
    uint256 public cnyEthRate;

    // bonus milestones
    uint256 public firstBonusSalesEnds;
    uint256 public secondBonusSalesEnds;
    uint256 public thirdBonusSalesEnds;
    uint256 public fourthBonusSalesEnds;
    uint256 public fifthBonusSalesEnds;
    uint256 public firstExtendedBonusSalesEnds;
    uint256 public secondExtendedBonusSalesEnds;
    uint256 public thirdExtendedBonusSalesEnds;
    uint256 public fourthExtendedBonusSalesEnds;
    uint256 public fifthExtendedBonusSalesEnds;
    uint256 public sixthExtendedBonusSalesEnds;

    // after the crowdsale
    mapping(uint256 => CrowdsalePurchase) public invalidatedOrigPurchases;  // Original purchase which was invalidated by owner
    mapping(uint256 => CrowdsalePurchase) public amendedOrigPurchases;      // Original purchase which was amended by owner

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

    /**
     * Contract functions
     */

    /**
     * @dev Contract constructor function sets owner and start date.
     * @param workshopAddr The address that will hold undelivered Star tokens
     * @param starbaseEpAddr The address that holds the early purchasers Star tokens
     */
    function StarbaseCrowdsale(address workshopAddr, address starbaseEpAddr) {
        require(workshopAddr != 0 && starbaseEpAddr != 0);

        owner = msg.sender;
        workshop = workshopAddr;
        starbaseEpAmendment = StarbaseEarlyPurchaseAmendment(starbaseEpAddr);
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
     * @dev Setup function sets external contracts' addresses.
     * @param starbaseTokenAddress Token address.
     * @param _purchaseStartBlock Block number to start crowdsale
     */
    function setup(address starbaseTokenAddress, uint256 _purchaseStartBlock)
        external
        onlyOwner
        returns (bool)
    {
        assert(address(starbaseToken) == 0);
        starbaseToken = AbstractStarbaseToken(starbaseTokenAddress);
        purchaseStartBlock = _purchaseStartBlock;
        return true;
    }

    /**
     * @dev Allows owner to record a purchase made outside of Ethereum blockchain
     * @param purchaser Address of a purchaser
     * @param rawAmount Purchased amount in CNY
     * @param purchasedAt Timestamp at the purchase made
     * @param data Identifier as an evidence of the purchase (e.g. btc:1xyzxyz)
     */
    function recordOffchainPurchase(
        address purchaser,
        uint256 rawAmount,
        uint256 purchasedAt,
        string data
    )
        external
        onlyFundraiser
        whenNotEnded
        rateIsSet(cnyBtcRate)
        returns (bool)
    {
        require(purchaseStartBlock > 0 && block.number >= purchaseStartBlock);
        if (startDate == 0) {
            startCrowdsale();
        }

        uint256 bonusTier = getBonusTier();
        uint amount = recordPurchase(purchaser, rawAmount, purchasedAt, data, bonusTier);

        StarBasePurchasedOffChain(purchaser, amount, rawAmount, cnyBtcRate, bonusTier, data);
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
     * @dev Ends crowdsale
     * @param timestamp Timestamp at the crowdsale ended
     */
    function endCrowdsale(uint256 timestamp)
        external
        onlyOwner
        returns (bool)
    {
        assert(timestamp > 0 && timestamp <= now);
        assert(endedAt == 0);   // overwriting time is not permitted
        endedAt = timestamp;
        CrowdsaleEnded(endedAt);
    }

    /**
     * @dev Invalidate a crowdsale purchase if something is wrong with it
     * @param purchaseIdx Index number of the crowdsalePurchases to invalidate
     */
    function invalidatePurchase(uint256 purchaseIdx)
        external
        onlyOwner
        whenEnded
        tokensNotDelivered
        returns (bool)
    {
        CrowdsalePurchase memory purchase = crowdsalePurchases[purchaseIdx];
        assert(purchase.purchaser != 0 && purchase.amount != 0);

        crowdsalePurchases[purchaseIdx].amount = 0;
        crowdsalePurchases[purchaseIdx].rawAmount = 0;
        invalidatedOrigPurchases[purchaseIdx] = purchase;
        PurchaseInvalidated(purchaseIdx);
        return true;
    }

    /**
     * @dev Amend a crowdsale purchase if something is wrong with it
     * @param purchaseIdx Index number of the crowdsalePurchases to invalidate
     * @param purchaser Address of the buyer
     * @param amount Purchased tokens as per the CNY rate used
     * @param rawAmount Purchased tokens as per the CNY rate used without the bonus
     * @param purchasedAt Timestamp at the purchase made
     * @param data Identifier as an evidence of the purchase (e.g. btc:1xyzxyz)
     * @param bonus bonus milestones of the purchase
     */
    function amendPurchase(
        uint256 purchaseIdx,
        address purchaser,
        uint256 amount,
        uint256 rawAmount,
        uint256 purchasedAt,
        string data,
        uint256 bonus
    )
        external
        onlyOwner
        whenEnded
        tokensNotDelivered
        returns (bool)
    {
        CrowdsalePurchase memory purchase = crowdsalePurchases[purchaseIdx];
        assert(purchase.purchaser != 0 && purchase.amount != 0);

        amendedOrigPurchases[purchaseIdx] = purchase;
        crowdsalePurchases[purchaseIdx] =
            CrowdsalePurchase(purchaser, amount, rawAmount, purchasedAt, data, bonus);
        PurchaseAmended(purchaseIdx);
        return true;
    }

    /**
     * @dev Deliver tokens to purchasers according to their purchase amount in CNY
     */
    function deliverPurchasedTokens()
        external
        onlyOwner
        whenEnded
        returns (bool)
    {
        assert(earlyPurchasesLoaded);
        assert(address(starbaseToken) != 0);

        uint256 totalAmountOfPurchasesInCny = totalRaisedAmountInCny(); // totalPreSale + totalCrowdsale

        for (uint256 i = numOfDeliveredCrowdsalePurchases; i < crowdsalePurchases.length && msg.gas > 200000; i++) {
            CrowdsalePurchase memory purchase = crowdsalePurchases[i];
            if (purchase.amount == 0) {
                continue;   // skip invalidated purchase
            }

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

            uint256 crowdsalePurchaseValue = purchase.amount;
            uint256 tokenCount = SafeMath.mul(crowdsaleTokenAmount, crowdsalePurchaseValue) / totalAmountOfPurchasesInCny;

            numOfPurchasedTokensOnCsBy[purchase.purchaser] = SafeMath.add(numOfPurchasedTokensOnCsBy[purchase.purchaser], tokenCount);
            starbaseToken.allocateToCrowdsalePurchaser(purchase.purchaser, tokenCount);
            numOfDeliveredCrowdsalePurchases = SafeMath.add(i, 1);
        }

        for (uint256 j = numOfDeliveredEarlyPurchases; j < earlyPurchasers.length && msg.gas > 200000; j++) {
            address earlyPurchaser = earlyPurchasers[j];

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

            uint256 earlyPurchaserPurchaseValue = earlyPurchasedAmountBy[earlyPurchaser];

            uint256 epTokenCalculationFromEPTokenAmount = SafeMath.mul(earlyPurchaseTokenAmount, earlyPurchaserPurchaseValue) / totalAmountOfEarlyPurchases();

            uint256 epTokenCalculationFromCrowdsaleTokenAmount = SafeMath.mul(crowdsaleTokenAmount, earlyPurchaserPurchaseValue) / totalAmountOfPurchasesInCny;

            uint256 epTokenCount = SafeMath.add(epTokenCalculationFromEPTokenAmount, epTokenCalculationFromCrowdsaleTokenAmount);

            numOfPurchasedTokensOnEpBy[earlyPurchaser] = SafeMath.add(numOfPurchasedTokensOnEpBy[earlyPurchaser], epTokenCount);
            starbaseToken.allocateToCrowdsalePurchaser(earlyPurchaser, epTokenCount);
            numOfDeliveredEarlyPurchases = SafeMath.add(j, 1);
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

                earlyPurchasedAmountBy[purchaser] += amountWithBonus;
            }
        }

        numOfLoadedEarlyPurchases += i;
        assert(numOfLoadedEarlyPurchases <= numOfOrigEp);
        if (numOfLoadedEarlyPurchases == numOfOrigEp) {
            earlyPurchasesLoaded = true;    // enable the flag
        }
        return true;
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
     * @dev Calculates total amount of tokens purchased includes bonus tokens.
     */
    function totalAmountOfCrowdsalePurchases() constant public returns (uint256 amount) {
        for (uint256 i; i < crowdsalePurchases.length; i++) {
            amount = SafeMath.add(amount, crowdsalePurchases[i].amount);
        }
    }

    /**
     * @dev Calculates total amount of tokens purchased without bonus conversion.
     */
    function totalAmountOfCrowdsalePurchasesWithoutBonus() constant public returns (uint256 amount) {
        for (uint256 i; i < crowdsalePurchases.length; i++) {
            amount = SafeMath.add(amount, crowdsalePurchases[i].rawAmount);
        }
    }

    /**
     * @dev Returns total raised amount in CNY (includes EP) and bonuses
     */
    function totalRaisedAmountInCny() constant public returns (uint256) {
        return SafeMath.add(totalAmountOfEarlyPurchases(), totalAmountOfCrowdsalePurchases());
    }

    /**
     * @dev Returns total amount of early purchases in CNY
     */
    function totalAmountOfEarlyPurchases() constant public returns(uint256) {
       return starbaseEpAmendment.totalAmountOfEarlyPurchases();
    }

    /**
     * @dev Allows qualified crowdsale partner to purchase Star Tokens
     */
    function purchaseAsQualifiedPartner()
        payable
        public
        rateIsSet(cnyEthRate)
        returns (bool)
    {
        require(qualifiedPartners[msg.sender].bonaFide);
        qualifiedPartners[msg.sender].amountRaised = SafeMath.add(msg.value, qualifiedPartners[msg.sender].amountRaised);

        assert(qualifiedPartners[msg.sender].amountRaised <= qualifiedPartners[msg.sender].amountCap);

        uint256 bonusTier = 30; // Pre sale purchasers get 30 percent bonus
        uint256 rawAmount = SafeMath.mul(msg.value, cnyEthRate) / 1e18;
        uint amount = recordPurchase(msg.sender, rawAmount, now, '', bonusTier);

        if (qualifiedPartners[msg.sender].commissionFeePercentage > 0) {
            sendQualifiedPartnerCommissionFee(msg.sender, msg.value);
        }

        StarBasePurchasedWithEth(msg.sender, amount, rawAmount, cnyEthRate, bonusTier);
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
        returns (bool)
    {
        require(purchaseStartBlock > 0 && block.number >= purchaseStartBlock);
        if (startDate == 0) {
            startCrowdsale();
        }

        uint256 bonusTier = getBonusTier();

        uint256 rawAmount = SafeMath.mul(msg.value, cnyEthRate) / 1e18;
        uint amount = recordPurchase(msg.sender, rawAmount, now, '', bonusTier);

        StarBasePurchasedWithEth(msg.sender, amount, rawAmount, cnyEthRate, bonusTier);
        return true;
    }

    /**
     * Internal functions
     */

    /**
     * @dev Initializes Starbase crowdsale
     */
    function startCrowdsale() internal returns (bool) {
        startDate = now;

        // set token bonus milestones
        firstBonusSalesEnds = startDate + 7 days;             // 1. 1st ~ 7th day
        secondBonusSalesEnds = firstBonusSalesEnds + 14 days; // 2. 8th ~ 21st day
        thirdBonusSalesEnds = secondBonusSalesEnds + 14 days; // 3. 22nd ~ 35th day
        fourthBonusSalesEnds = thirdBonusSalesEnds + 7 days;  // 4. 36th ~ 42nd day
        fifthBonusSalesEnds = fourthBonusSalesEnds + 3 days;  // 5. 43rd ~ 45th day

        // extended sales bonus milestones
        firstExtendedBonusSalesEnds = fifthBonusSalesEnds + 3 days;         // 1. 46th ~ 48th day
        secondExtendedBonusSalesEnds = firstExtendedBonusSalesEnds + 3 days; // 2. 49th ~ 51st day
        thirdExtendedBonusSalesEnds = secondExtendedBonusSalesEnds + 3 days; // 3. 52nd ~ 54th day
        fourthExtendedBonusSalesEnds = thirdExtendedBonusSalesEnds + 3 days; // 4. 55th ~ 57th day
        fifthExtendedBonusSalesEnds = fourthExtendedBonusSalesEnds + 3 days;  // 5. 58th ~ 60th day
        sixthExtendedBonusSalesEnds = fifthExtendedBonusSalesEnds + 60 days; // 6. 61st ~ 120th day
    }

    /**
     * @dev Abstract record of a purchase to Tokens
     * @param purchaser Address of the buyer
     * @param rawAmount Amount in CNY as per the CNY/ETH rate used
     * @param timestamp Timestamp at the purchase made
     * @param data Identifier as an evidence of the purchase (e.g. btc:1xyzxyz)
     * @param bonusTier bonus milestones of the purchase
     */
    function recordPurchase(
        address purchaser,
        uint256 rawAmount,
        uint256 timestamp,
        string data,
        uint256 bonusTier
    )
        internal
        returns(uint256 amount)
    {
        amount = rawAmount; // amount to check reach of max cap. it does not care for bonus tokens here

        // presale transfers which occurs before the crowdsale ignores the crowdsale hard cap
        if (block.number >= purchaseStartBlock) {

            assert(totalAmountOfCrowdsalePurchasesWithoutBonus() <= MAX_CROWDSALE_CAP);

            uint256 crowdsaleTotalAmountAfterPurchase = SafeMath.add(totalAmountOfCrowdsalePurchasesWithoutBonus(), amount);

            // check whether purchase goes over the cap and send the difference back to the purchaser.
            if (crowdsaleTotalAmountAfterPurchase > MAX_CROWDSALE_CAP) {
              uint256 difference = SafeMath.sub(crowdsaleTotalAmountAfterPurchase, MAX_CROWDSALE_CAP);
              uint256 ethValueToReturn = SafeMath.mul(difference, 1e18) / cnyEthRate;
              purchaser.transfer(ethValueToReturn);
              amount = SafeMath.sub(amount, difference);
              rawAmount = amount;
            }

        }

        uint256 covertedAmountwWithBonus = SafeMath.mul(amount, bonusTier) / 100;
        amount = SafeMath.add(amount, covertedAmountwWithBonus); // at this point amount bonus is calculated

        CrowdsalePurchase memory purchase = CrowdsalePurchase(purchaser, amount, rawAmount, timestamp, data, bonusTier);
        crowdsalePurchases.push(purchase);
        return amount;
    }

    /**
     * @dev Fetchs Bonus tier percentage per bonus milestones
     */
    function getBonusTier() internal returns (uint256) {
        bool firstBonusSalesPeriod = now >= startDate && now <= firstBonusSalesEnds; // 1st ~ 7th day get 20% bonus
        bool secondBonusSalesPeriod = now > firstBonusSalesEnds && now <= secondBonusSalesEnds; // 8th ~ 21st day get 15% bonus
        bool thirdBonusSalesPeriod = now > secondBonusSalesEnds && now <= thirdBonusSalesEnds; // 22nd ~ 35th day get 10% bonus
        bool fourthBonusSalesPeriod = now > thirdBonusSalesEnds && now <= fourthBonusSalesEnds; // 36th ~ 42nd day get 5% bonus
        bool fifthBonusSalesPeriod = now > fourthBonusSalesEnds && now <= fifthBonusSalesEnds; // 43rd and 45th day get 0% bonus

        // extended bonus sales
        bool firstExtendedBonusSalesPeriod = now > fifthBonusSalesEnds && now <= firstExtendedBonusSalesEnds; // extended sales 46th ~ 48th day get 20% bonus
        bool secondExtendedBonusSalesPeriod = now > firstExtendedBonusSalesEnds && now <= secondExtendedBonusSalesEnds; // 49th ~ 51st 15% bonus
        bool thirdExtendedBonusSalesPeriod = now > secondExtendedBonusSalesEnds && now <= thirdExtendedBonusSalesEnds; // 52nd ~ 54th day get 10% bonus
        bool fourthExtendedBonusSalesPeriod = now > thirdExtendedBonusSalesEnds && now <= fourthExtendedBonusSalesEnds; // 55th ~ 57th day day get 5% bonus
        bool fifthExtendedBonusSalesPeriod = now > fourthExtendedBonusSalesEnds && now <= fifthExtendedBonusSalesEnds; // 58th ~ 60th day get 0% bonus
        bool sixthExtendedBonusSalesPeriod = now > fifthExtendedBonusSalesEnds && now <= sixthExtendedBonusSalesEnds; // 61st ~ 120th day get {number_of_days} - 60 * 1% bonus

        if (firstBonusSalesPeriod || firstExtendedBonusSalesPeriod) return 20;
        if (secondBonusSalesPeriod || secondExtendedBonusSalesPeriod) return 15;
        if (thirdBonusSalesPeriod || thirdExtendedBonusSalesPeriod) return 10;
        if (fourthBonusSalesPeriod || fourthExtendedBonusSalesPeriod) return 5;
        if (fifthBonusSalesPeriod || fifthExtendedBonusSalesPeriod) return 0;

        if (sixthExtendedBonusSalesPeriod) {
          uint256 DAY_IN_SECONDS = 86400;
          uint256 secondsSinceStartDate = SafeMath.sub(now, startDate);
          uint256 numberOfDays = secondsSinceStartDate / DAY_IN_SECONDS;

          return SafeMath.sub(numberOfDays, 60);
        }
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
