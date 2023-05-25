// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.10;

interface IOperator {
    /// @dev Emitted when operator is added
    event OperatorAdded(address indexed operator);
    /// @dev Emitted when operator is removed
    event OperatorRemoved(address indexed operator);

    function addOperator(address _operator) external;
    function removeOperator(address _operator) external;
    function getOperator(uint256 _index) external view returns (address);
    function getAllOperatorsLength() external view returns (uint256);
    function isOperator(address _operator) external view returns (bool);
}
