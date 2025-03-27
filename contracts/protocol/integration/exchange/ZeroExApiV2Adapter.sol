// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.6.10;
pragma experimental ABIEncoderV2;

/**
 * @title ZeroExApiV2Adapter
 *
 * Exchange adapter for 0xAPI v2 that returns data for swaps
 */
contract ZeroExApiV2Adapter {

    address private constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public immutable wethAddress;
    address public immutable getSpender;

    constructor(address _allowanceHolderAddress, address _wethAddress) public {
        require(_allowanceHolderAddress != address(0), "AllowanceHolder address is zero");
        require(_wethAddress != address(0), "WETH address is zero");

        wethAddress = _wethAddress;
        getSpender = _allowanceHolderAddress;
    }

    struct TradeParams {
        address to;
        bytes data;
        address inputToken;
        address outputToken;
        address recipient;
        uint256 inputTokenAmount;
        uint256 minOutputTokenAmount;
    }

    function generateDataParam(
        address _to,
        bytes calldata _data
    )
        external
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(_to, _data);
    }

    function getTradeCalldata(
        address _sourceToken,
        address _destinationToken,
        address _destinationAddress,
        uint256 _sourceQuantity,
        uint256 _minDestinationQuantity,
        bytes calldata _data
    )
        external
        view
        returns (address, uint256, bytes memory)
    {
        TradeParams memory params = _decodeTradeParams(_data);

        require(params.to != address(0), "To address is zero");
        require(params.inputToken != ETH_ADDRESS && params.outputToken != ETH_ADDRESS, "ETH not supported");
        require(params.inputToken == _sourceToken, "Mismatched input token");
        require(params.outputToken == _destinationToken, "Mismatched output token");
        require(params.recipient == _destinationAddress, "Mismatched recipient");
        require(params.inputTokenAmount == _sourceQuantity, "Mismatched input token quantity");
        require(params.minOutputTokenAmount >= _minDestinationQuantity, "Mismatched output token quantity");

        return (params.to, 0, params.data);
    }

    function _decodeTradeParams(
        bytes calldata _data
    )
        private
        pure
        returns (TradeParams memory results)
    {
        require(_data.length >= 20, "Insufficient data for 'to' address");
        address actualTo = _getToAddress(_data);
        bytes calldata execData = _data[20:];

        (
            address inputToken,
            uint256 inputTokenAmount,
            address outputToken,
            address recipient,
            uint256 minAmountOut
        ) = _decodeExecAndInnerData(execData);

        results.to = actualTo;
        results.data = execData;
        results.inputToken = inputToken;
        results.outputToken = outputToken;
        results.recipient = recipient;
        results.inputTokenAmount = inputTokenAmount;
        results.minOutputTokenAmount = minAmountOut;
    }

    function _getSelector(bytes memory data)
        private
        pure
        returns (bytes4 selector)
    {
        require(data.length >= 4, "Insufficient data for function selector");
        assembly {
            let word := mload(add(data, 32))
            selector := and(word, 0xffffffff00000000000000000000000000000000000000000000000000000000)
        }
    }

    function _getToAddress(bytes memory _data)
        private
        pure
        returns (address to)
    {
        assembly {
            let word := mload(add(_data, 32))
            to := shr(96, word)
        }
    }

    /**
     * @dev Decodes the 0x v2 execData and its innerData:
     *      - 4 bytes for the exec selector
     *      - 4 * 32 bytes for (operator, inputToken, inputAmount, target)
     *      - 64 bytes for the bytes (offset + length)
     *      => 4 + (4*32) + 64 = 196
     */
    function _decodeExecAndInnerData(
        bytes calldata execData
    )
        private
        pure
        returns (
            address inputToken,
            uint256 inputTokenAmount,
            address outputToken,
            address recipient,
            uint256 minAmountOut
        )
    {
        bytes4 selector = _getSelector(execData);
        require(selector == 0x2213bc0b, "Invalid exec selector");

        bytes calldata execDataWithoutSelector = execData[4:];
        bytes calldata innerData = execData[196:];

        (/*operator*/, inputToken, inputTokenAmount, /*target*/, /* innerData */) =
            abi.decode(execDataWithoutSelector, (address, address, uint256, address, bytes));

        bytes4 innerSelector = _getSelector(innerData);
        require(innerSelector == 0x1fff991f, "Invalid execute selector");

        bytes calldata innerDataWithoutSelector = innerData[4:];
        (recipient, outputToken, minAmountOut, /*actions*/, /*zidAndAffiliate*/) =
            abi.decode(innerDataWithoutSelector, (address, address, uint256, bytes[], bytes32));
    }
}
