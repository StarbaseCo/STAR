pragma solidity ^0.4.13;

import './MultiSigWallet.sol';
import 'zeppelin-solidity/contracts/math/SafeMath.sol';

/**
 * @title Multi signature wallet for presale of Starbase crowdsale
 * @author Starbase PTE. LTD. - <info@starbase.co>
 */
contract StarbasePresaleWallet is MultiSigWallet {
    /*
     *  Storage
     */
    uint256 public maxCap;          // in Wei
    uint256 public totalPaidAmount; // in Wei

    struct WhitelistAddresses {
        uint256 capForAmountRaised;
        uint256 amountRaised;
        bool    bonaFide;
    }

    mapping (address => WhitelistAddresses) public whitelistedAddresses;

    /*
     * functions
     */

    /**
     * @dev Contract constructor sets initial owners and required number of confirmations.
     * @param _owners List of initial owners.
     * @param _required Number of required confirmations.
     * @param _maxCap Maximum pre-purchase cap of this wallet
     */
    function StarbasePresaleWallet(address[] _owners, uint256 _required, uint256 _maxCap)
        public
        MultiSigWallet(_owners, _required)
    {
        maxCap = _maxCap;
    }

    /*
     * External functions
     */

    /**
     * @dev Add whitelisted address to the presale.
     * @param addressToWhitelist Address to be added to the list.
     * @param capAmount Amount that the address is able to raise during the presale.
     */
    function whitelistAddress(address addressToWhitelist, uint256 capAmount)
        external
        ownerExists(msg.sender)
    {
        assert(!whitelistedAddresses[addressToWhitelist].bonaFide);
        whitelistedAddresses[addressToWhitelist].bonaFide = true;
        whitelistedAddresses[addressToWhitelist].capForAmountRaised = capAmount;
    }

    /**
     * @dev Remove address the presale list.
     * @param addressToUnwhitelist Address to be removed from the list.
     */
    function unwhitelistAddress(address addressToUnwhitelist)
        external
        ownerExists(msg.sender)
    {
        assert(whitelistedAddresses[addressToUnwhitelist].bonaFide);
        whitelistedAddresses[addressToUnwhitelist].bonaFide = false;
    }

    /**
     * @dev Update whitelisted address amount allowed to raise during the presale.
     * @param whitelistedAddress Address that is updated.
     * @param capAmount Amount that the address is able to raise during the presale.
     */
    function changeWhitelistedAddressCapAmount(address whitelistedAddress, uint256 capAmount)
        external
        ownerExists(msg.sender)
    {
        assert(whitelistedAddresses[whitelistedAddress].bonaFide);
        whitelistedAddresses[whitelistedAddress].capForAmountRaised = capAmount;
    }

    /**
     * @dev Update the maximum cap of this wallet
     * @param _maxCap New maximum cap
     */
    function changeMaxCap(uint256 _maxCap)
        external
        ownerExists(msg.sender)
    {
        assert(totalPaidAmount <= _maxCap);
        maxCap = _maxCap;
    }

    /*
     * Public functions
     */

    /**
     * @dev Payment function that accepts ETH from whitelisted addresses till cap is reached
     */
    function payment() payable {
        require(msg.value > 0 && this.balance <= maxCap);
        require(whitelistedAddresses[msg.sender].bonaFide);

        whitelistedAddresses[msg.sender].amountRaised = SafeMath.add(msg.value, whitelistedAddresses[msg.sender].amountRaised);

        assert(whitelistedAddresses[msg.sender].amountRaised <= whitelistedAddresses[msg.sender].capForAmountRaised);

        totalPaidAmount = SafeMath.add(totalPaidAmount, msg.value);
        Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Fallback accepts ETH
     */
    function () payable {
        payment();
    }
}
