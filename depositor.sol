// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DepositorAddress is Ownable{

    uint256 public index = 0;

    mapping(address => uint256) public addressToInteger;
    mapping(uint256 => address) public integerToAddress;

    event IntegerUpdated(address indexed _address, uint256 _newValue);
    event AddressAdded(address);
    
    function addAddress(address _address, uint256 _initialValue) public onlyOwner {        
        require(addressToInteger[_address] == 0, "Address already exists in mapping");
        addressToInteger[_address] = _initialValue;
        integerToAddress[index] = _address;
        index++;
        emit AddressAdded(_address);
    }
    }
