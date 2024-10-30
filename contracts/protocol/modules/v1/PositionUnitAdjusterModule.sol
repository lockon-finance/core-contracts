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

        for (uint256 i = 0; i < componentCount; i++) {
            IERC20 component = _components[i];
            require(component != IERC20(0), "Invalid component");

            int256 currentUnit = _setToken.getDefaultPositionRealUnit(address(component));
            int256 calculatedUnit = currentUnit;
            uint256 balance = component.balanceOf(address(_setToken));
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
     * @param _components Array of components to adjust
     * @param _requestedUnits Array of requested new unit values. If a value is 0, the calculated unit is used as the new unit for that component.
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

        for (uint256 i = 0; i < componentCount; i++) {
            IERC20 component = _componentData[i].component;
            int256 currentRealUnit = _componentData[i].currentRealUnit;
            int256 calculatedRealUnit = _componentData[i].calculatedRealUnit;
            int256 requestedRealUnit = _requestedUnits[i];

            if (currentRealUnit == calculatedRealUnit) {
                continue;
            }

            require(requestedRealUnit == 0 || requestedRealUnit > currentRealUnit, "Requested unit is less than or equal to current unit");
            require(requestedRealUnit == 0 || requestedRealUnit <= calculatedRealUnit, "Requested unit is greater than calculated unit");

            // If the requested unit is 0, the calculated unit is used as the new unit.
            if (requestedRealUnit == 0) {
                requestedRealUnit = calculatedRealUnit;
            }
            _setToken.editDefaultPositionUnit(address(component), requestedRealUnit);

            emit DefaultPositionUnitAdjusted(
                _setToken,
                component,
                _componentData[i].balance,
                currentRealUnit,
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
