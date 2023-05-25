// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.10;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import { IOperator } from "../interfaces/IOperator.sol";

/**
 * @title Operator
 * @dev This contract manages the privilege of the operator.
 */
contract Operator is IOperator, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev Array of all operators
    EnumerableSet.AddressSet private _allOperators;

    /// @dev Add new operator
    /// @param _operator Address of operator
    function addOperator(address _operator) public override onlyOwner {
        require (_allOperators.add(_operator), "alreadyExists");

        emit OperatorAdded(_operator);
    }

    /// @dev Remove operator from the allowlist
    /// @param _operator Address of operator
    function removeOperator(address _operator) external override onlyOwner {
      require (_allOperators.remove(_operator), "notExists");

        emit OperatorRemoved(_operator);
    }

    /// @dev Get the operator from the allowlist
    /// @param _index Index of allowed lists
    /// @return operator Address of operator
    function getOperator(uint256 _index) external view override returns (address) {
        return _allOperators.at(_index);
    }

    /// @dev Get number of operators on the allowlist
    /// @return length Number of operators
    function getAllOperatorsLength() external view override returns (uint256) {
        return _allOperators.length();
    }

    /// @dev Returns true if address is a registered the allowlist
    /// @param _operator Address of operator
    /// @return returns TRUE if operator registerd, otherwise false
    function isOperator(address _operator) public view override returns (bool) {
        return _allOperators.contains(_operator);
    }
}
