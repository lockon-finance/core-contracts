// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.10;

import { ModuleBase } from "../../protocol/lib/ModuleBase.sol";
import { Operator } from "../../protocol/Operator.sol";
import { ISetToken } from "../../interfaces/ISetToken.sol";
import { IController } from "../../interfaces/IController.sol";

/**
 * @title ExtendModuleBase
 *
 * Abstract class that houses common Module-related state and functions.
 *
 * CHANGELOG:
 * - Add operator privileges.
 *
 */
abstract contract ExtendModuleBase is ModuleBase, Operator {
    /* ============ Modifiers ============ */

    modifier onlyManagerOrOperatorAndValidSet(ISetToken _setToken) {
        _validateOnlyManagerOrOperatorAndValidSet(_setToken);
        _;
    }

    /* ============ Constructor ============ */

    /**
     * Set state variables
     *
     * @param _controller             Address of controller contract
     */
    constructor(IController _controller) public ModuleBase(_controller) {}

    /* ============== Modifier Helpers ===============
     * Internal functions used to reduce bytecode size
     */

    /**
     * Caller must SetToken manager or operator and SetToken must be valid and initialized
     */
    function _validateOnlyManagerOrOperatorAndValidSet(ISetToken _setToken) internal view {
       require(isSetManager(_setToken, msg.sender) || isOperator(msg.sender), "OnlyManagerOrOperator");
       require(isSetValidAndInitialized(_setToken), "Must be a valid and initialized SetToken");
    }
}
