// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.10;
pragma experimental "ABIEncoderV2";

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/SafeCast.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IController } from "../../../interfaces/IController.sol";
import { ISetToken } from "../../../interfaces/ISetToken.sol";
import { ExtendModuleBase } from "../../lib/ExtendModuleBase.sol";
import { Position } from "../../lib/Position.sol";
import { PreciseUnitMath } from "../../../lib/PreciseUnitMath.sol";

/**
 * @title PositionUnitAdjusterModule
 * @dev  This module is designed to adjust the unit numbers of SetTokens.
 * Administrators and operators can update the unit numbers of positions based on the actual balances of components.
 * It is used to correct discrepancies between the SetToken's unit numbers and actual balances in the following cases:
 * - When small rounding errors accumulate due to repeated trades
 * - When the component balance of the SetToken increases due to external factors
 *
 * Note that the module allows setting units lower than the actual balance-based unit to exclude certain tokens
 * that should not be counted in the portfolio (e.g., airdropped).
 *
 * To prevent unauthorized reduction of positions, units can only be adjusted upward from their current values.
 * Valid range: current unit <= new unit <= actual balance-based unit
 */
contract PositionUnitAdjusterModule is ExtendModuleBase, ReentrancyGuard {
    using SafeCast for int256;
    using SafeCast for uint256;
    using SignedSafeMath for int256;
    using SafeMath for uint256;

    using Position for ISetToken;
    using PreciseUnitMath for uint256;

    /* ============ Struct ============ */

    /**
     * @dev Struct to store component data
     *
     * @param balance The balance of the component
     * @param currentRealUnit The current real unit of the component
     * @param calculatedRealUnit The calculated real unit of the component
     */
    struct ComponentData {
        IERC20 component;
        uint256 balance;
        int256 currentRealUnit;
        int256 calculatedRealUnit;
    }

    /* ============ Events ============ */

    /**
     * @dev Emitted when the default position unit is adjusted
     *
     * @param _setToken The SetToken instance
     * @param _component The component token
     * @param _componentBalance The balance of the component
     * @param _currentRealUnit The current real unit of the component
     * @param _newRealUnit The new real unit of the component
     */
    event DefaultPositionUnitAdjusted(
        ISetToken indexed _setToken,
        IERC20 indexed _component,
        uint256 _componentBalance,
        int256 _currentRealUnit,
        int256 _newRealUnit
    );

    /* ============ Constructor ============ */

    constructor(IController _controller, address _operator) public ExtendModuleBase(_controller) {
        super.addOperator(_operator);
    }

    /* ============ External Functions ============ */

    /**
     * @dev Initializes this module for the SetToken. Only callable by the SetToken's manager.
     *
     * @param _setToken Instance of the SetToken to initialize
     */
    function initialize(
        ISetToken _setToken
    )
        external
        onlyValidAndPendingSet(_setToken)
        onlySetManager(_setToken, msg.sender)
    {
        _setToken.initializeModule();
    }


    /**
     * @dev Calculates the current and new units of the components.
     *
     * @param _setToken     Instance of the SetToken
     * @param _components  Array of components
     * @return _totalSupply  Total supply of the SetToken
     * @return _componentData  Array of component data
     */
    function calculateDefaultPositionUnits(
        ISetToken _setToken,
        IERC20[] memory _components
    )
        public
        view
        returns (
            uint256 _totalSupply,
            ComponentData[] memory _componentData
        )
    {
        uint256 componentCount = _components.length;

        _totalSupply = _setToken.totalSupply();
        _componentData = new ComponentData[](componentCount);

        IERC20 component;
        int256 currentUnit;
        int256 calculatedUnit;
        uint256 balance;
        for (uint256 i = 0; i < componentCount; i++) {
            component = _components[i];
            require(component != IERC20(0), "Invalid component");

            currentUnit = _setToken.getDefaultPositionRealUnit(address(component));
            calculatedUnit = currentUnit;
            balance = component.balanceOf(address(_setToken));

            if (_totalSupply > 0) {
                // To correct the deviation due to repeated trades, instead of using Position.calculateDefaultEditPositionUnit, the actual asset balance is used to calculate.
                calculatedUnit = balance.preciseDiv(_totalSupply).toInt256();
            }

            _componentData[i] = ComponentData({
                component: component,
                balance: balance,
                currentRealUnit: currentUnit,
                calculatedRealUnit: calculatedUnit
            });
        }
    }


    /**
     * @dev Adjusts the unit numbers of the components.
     * If the total supply is 0, the function will revert. This is because units cannot be recalculated when the total supply is 0.
     *
     * @param _setToken Instance of the SetToken
     * @param _components Array of components to adjust. Elements must be unique (no duplicate components allowed).
     * @param _requestedUnits Array of requested new unit values. Must be non-negative (>= 0).
     *                        If a value is 0, the calculated unit is used as the new unit for that component.
     *                        If a value is greater than 0, it must be greater than the current unit and
     *                        less than or equal to the calculated unit.
     */
    function adjustDefaultPositionUnits(
        ISetToken _setToken,
        IERC20[] calldata _components,
        int256[] calldata _requestedUnits
    )
        external
        nonReentrant
        onlyManagerOrOperatorAndValidSet(_setToken)
    {
        uint256 componentCount = _components.length;
        require(componentCount > 0, "No components provided");
        require(_requestedUnits.length == componentCount, "Invalid requested units length");

        (
            uint256 _totalSupply,
            ComponentData[] memory _componentData
        ) = calculateDefaultPositionUnits(_setToken, _components);

        require(_totalSupply > 0, "Total supply is 0");

        ComponentData memory eachComponentData;
        int256 requestedRealUnit;
        for  (uint256 i = 0; i < componentCount; i++) {
            eachComponentData = _componentData[i];
            requestedRealUnit = _requestedUnits[i];

            if (eachComponentData.currentRealUnit == eachComponentData.calculatedRealUnit) {
                continue;
            }

            require(requestedRealUnit >= 0, "Requested unit is less than 0");
            if (requestedRealUnit == 0) {
                // If the requested unit is 0, the calculated unit is used as the new unit.
                requestedRealUnit = eachComponentData.calculatedRealUnit;
            } else {
                require(requestedRealUnit > eachComponentData.currentRealUnit, "Requested unit is less than or equal to current unit");
                require(requestedRealUnit <= eachComponentData.calculatedRealUnit, "Requested unit is greater than calculated unit");
            }
            _setToken.editDefaultPosition(address(eachComponentData.component), requestedRealUnit.toUint256());

            emit DefaultPositionUnitAdjusted(
                _setToken,
                eachComponentData.component,
                eachComponentData.balance,
                eachComponentData.currentRealUnit,
                requestedRealUnit
            );
        }
    }

    /**
     * @dev Removes this module from the SetToken, via call by the SetToken. Left with empty logic
     * here because there are no check needed to verify removal.
     */
    function removeModule() external override {}

}
