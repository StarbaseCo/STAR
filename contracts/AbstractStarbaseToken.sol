pragma solidity ^0.4.13;

import 'zeppelin-solidity/contracts/token/ERC20.sol';

contract AbstractStarbaseToken is ERC20 {
    function isFundraiser(address fundraiserAddress) public returns (bool);
    function company() public returns (address);
    function allocateToCrowdsalePurchaser(address to, uint256 value) public returns (bool);
    function allocateToMarketingSupporter(address to, uint256 value) public returns (bool);
}
