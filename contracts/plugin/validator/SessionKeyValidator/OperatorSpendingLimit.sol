// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

/**
 * @title OperatorSpendingLimit
 */
abstract contract OperatorSpendingLimit {
    using BytesLib for bytes;

    struct SpendingLimitSetConfig {
        // The address of the token to set the spending limit, address(0) for native token
        address token;
        // Max allowance, 0 for unlimited
        uint256 allowance;
        // Spent amount
        uint256 spent;
    }

    struct SpendingLimitInfo {
        uint256 allowance;
        uint256 spent;
    }

    event SetSpendingLimit(
        address indexed wallet,
        address indexed operator,
        address indexed token,
        uint256 allowance,
        uint256 spent
    );

    /// @dev ERC20 Token Method Selectors
    bytes4 internal constant TRANSFER = ERC20.transfer.selector;
    bytes4 internal constant TRANSFER_FROM = ERC20.transferFrom.selector;
    bytes4 internal constant APPROVE = ERC20.approve.selector;
    bytes4 internal constant INCREASE_ALLOWANCE = ERC20.increaseAllowance.selector;

    /// @dev Operator's spendinglimit info, keccak256(operator, token) => wallet => spendinglimit
    mapping(bytes32 => mapping(address => SpendingLimitInfo)) _spendingLimit;

    /**
     * @dev check and update spendinglimit of an session key execution
     */
    function _checkSpendingLimit(
        address wallet,
        address operator,
        address to,
        bytes memory data,
        uint256 value
    ) internal {
        // Check spending limit for native token
        if (value > 0) {
            _checkNativeTokenSpendingLimit(wallet, operator, value);
        }
        // Check spending limit for ERC20 token
        if (data.length > 0) {
            _checkERC20TokenSpendingLimit(wallet, operator, to, data);
        }
    }

    /**
     * @dev Sets the spending limit for the caller based on the provided SpendingLimitSetConfig.
     */
    function setSpendingLimit(address operator, SpendingLimitSetConfig memory config) public virtual {
        _setSpendingLimit(msg.sender, operator, config);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided SpendingLimitSetConfig array.
     */
    function batchSetSpendingLimit(address operator, SpendingLimitSetConfig[] memory configs) public virtual {
        _batchSetSpendingLimit(msg.sender, operator, configs);
    }

    /**
     * @dev Returns the spending limit info for the operator.
     */
    function getSpendingLimitInfo(
        address wallet,
        address operator,
        address token
    ) public view returns (SpendingLimitInfo memory) {
        return _getSpendingLimitInfo(wallet, operator, token);
    }

    /**
     * @dev Internal function to check the spending limit for native token.
     */
    function _checkNativeTokenSpendingLimit(address wallet, address operator, uint256 value) internal {
        SpendingLimitInfo memory spendingLimitInfo = _getSpendingLimitInfo(wallet, operator, address(0));
        // Check if there is a spending limit set for this wallet
        if (spendingLimitInfo.allowance > 0) {
            // Update the spent amount with the transaction value
            spendingLimitInfo.spent += value;
            _checkAmountAndUpdate(wallet, operator, address(0), spendingLimitInfo);
        }
    }

    /**
     * @dev Internal function to check the spending limit for an ERC20 token.
     * @param wallet The address of the wallet.
     * @param token The address of the ERC20 token.
     * @param data The transaction data.
     */
    function _checkERC20TokenSpendingLimit(
        address wallet,
        address operator,
        address token,
        bytes memory data
    ) internal {
        SpendingLimitInfo memory spendingLimitInfo = _getSpendingLimitInfo(wallet, operator, token);
        // Check if there is a spending limit set for this token
        if (spendingLimitInfo.allowance > 0) {
            bytes4 selector = bytes4(data.slice(0, 4));
            bytes memory callData = data.slice(4, data.length - 4);
            if (selector == TRANSFER || selector == INCREASE_ALLOWANCE || selector == APPROVE) {
                (address to, uint256 value) = abi.decode(callData, (address, uint256));
                if (to != wallet) {
                    spendingLimitInfo.spent += value;
                }
            } else if (selector == TRANSFER_FROM) {
                (address from, , uint256 value) = abi.decode(callData, (address, address, uint256));
                if (from == wallet) {
                    spendingLimitInfo.spent += value;
                }
            }
            _checkAmountAndUpdate(wallet, operator, token, spendingLimitInfo);
        }
    }

    /**
     * @dev Internal function to check spent amount and update the spending limit information.
     */
    function _checkAmountAndUpdate(
        address wallet,
        address operator,
        address token,
        SpendingLimitInfo memory spendingLimitInfo
    ) internal {
        // Ensure that the spent amount does not exceed the allowance amount
        require(spendingLimitInfo.spent <= spendingLimitInfo.allowance, "OperatorSpendingLimit: token overspending");
        _updateSpendingLimitInfo(wallet, operator, token, spendingLimitInfo);
    }

    /**
     * @dev Internal function to update spendinglimit info of an operator.
     */
    function _updateSpendingLimitInfo(
        address wallet,
        address operator,
        address token,
        SpendingLimitInfo memory spendingLimitInfo
    ) internal {
        _spendingLimit[_getKey(operator, token)][wallet] = spendingLimitInfo;
    }

    /**
     * @dev Internal function to get spendinglimit info of an operator.
     */
    function _getSpendingLimitInfo(
        address wallet,
        address operator,
        address token
    ) internal view returns (SpendingLimitInfo memory) {
        return _spendingLimit[_getKey(operator, token)][wallet];
    }

    /**
     * @dev Sets the spending limit for the operator based on the provided SpendingLimitSetConfig.
     */
    function _setSpendingLimit(address wallet, address operator, SpendingLimitSetConfig memory config) internal {
        SpendingLimitInfo memory spendingLimitInfo = SpendingLimitInfo({
            allowance: config.allowance,
            spent: config.spent
        });
        _updateSpendingLimitInfo(wallet, operator, config.token, spendingLimitInfo);
        emit SetSpendingLimit(wallet, operator, config.token, config.allowance, config.spent);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided SpendingLimitSetConfig array.
     */
    function _batchSetSpendingLimit(
        address wallet,
        address operator,
        SpendingLimitSetConfig[] memory configs
    ) internal {
        uint dataLength = configs.length;
        require(dataLength > 0, "SpendingLimitHooks: dataLength should greater than zero");
        for (uint i = 0; i < dataLength; i++) {
            _setSpendingLimit(wallet, operator, configs[i]);
        }
    }

    function _getKey(address operator, address token) internal pure returns (bytes32) {
        return keccak256(abi.encode(operator, token));
    }
}
