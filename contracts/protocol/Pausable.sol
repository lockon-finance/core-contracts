// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.10;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Pausable
 * This contract makes it possible to pause the contract.
 */
abstract contract Pausable is Ownable {
    /// @dev Emitted when the pause is triggered
    event Paused(address account);

    /// @dev Emitted when the unpause is triggered
    event Unpaused(address account);

    /// @dev pause status
    bool private _paused;

    /// @dev Throws if the contract is paused.
    modifier whenNotPaused() {
        require(!_paused, "Pausable: paused");
        _;
    }

    /// @dev Throws if the contract is not paused.
    modifier whenPaused() {
        require(_paused, "Pausable: not paused");
        _;
    }

    /// @notice Returns the pause status
    function paused() public view returns (bool) {
      return _paused;
    }

    /// @notice Triggers stopped state
    function pause() virtual external onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Returns to normal state.
    function unpause() virtual external onlyOwner whenPaused {
        _paused = false;
        emit Unpaused(msg.sender);
    }
}
