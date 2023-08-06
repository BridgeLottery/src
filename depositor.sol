// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

contract DepositorAddress 
{

    mapping(address => uint256) public addressToInteger;
    mapping(uint256 => address) public integerToAddress;

    event IntegerUpdated(address indexed _address, uint256 _newValue);
    event AddressAdded(address);

    function setInteger(address _address, uint256 _value) external {
        addressToInteger[_address] += _value;
        emit IntegerUpdated(_address, _value);
    }

    function addAddress(address _address, uint256 _initialValue) external 
    {
      require(addressToInteger[_address] == 0, "Address already exists in mapping");
      addressToInteger[_address] = _initialValue;
      integerToAddress[index] = _address;
      index++;
      emit AddressAdded(_address);
    }
}
