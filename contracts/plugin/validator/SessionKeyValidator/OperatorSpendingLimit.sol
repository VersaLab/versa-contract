// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

import "hardhat/console.sol";

abstract contract OperatorSpendingLimit {
    using BytesLib for bytes;

    struct SpendingLimitSetConfig {
        address token;
        uint256 allowance;
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

    // ERC20 Token Method Selector
    bytes4 internal constant TRANSFER = ERC20.transfer.selector;
    bytes4 internal constant TRANSFER_FROM = ERC20.transferFrom.selector;
    bytes4 internal constant APPROVE = ERC20.approve.selector;
    bytes4 internal constant INCREASE_ALLOWANCE = ERC20.increaseAllowance.selector;

    // spendingLimit: keccack(abi.encode(operator, token)) => wallet => spendinglimit
    mapping(bytes32 => mapping(address => SpendingLimitInfo)) _spendingLimit;

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
     * @param config The SpendingLimitSetConfig to set the spending limit.
     */
    function setSpendingLimit(address operator, SpendingLimitSetConfig memory config) public virtual {
        _setSpendingLimit(msg.sender, operator, config);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided SpendingLimitSetConfig array.
     * @param configs An array of SpendingLimitSetConfig objects.
     */
    function batchSetSpendingLimit(address operator, SpendingLimitSetConfig[] memory configs) public virtual {
        _batchSetSpendingLimit(msg.sender, operator, configs);
    }

    // getSpendingLimitInfo: operator => token => wallet => spendinglimit
    function getSpendingLimitInfo(
        address wallet,
        address operator,
        address token
    ) public view returns (SpendingLimitInfo memory) {
        return _getSpendingLimitInfo(wallet, operator, token);
    }

    /**
     * @dev Internal function to check the spending limit for native token.
     * @param wallet The address of the wallet.
     * @param value The value of the transaction.
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
     * @param token The address of the token.
     * @param spendingLimitInfo The updated spending limit information to be stored.
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

    // updateSpendingLimitInfo: operator => token => wallet => spendinglimit
    function _updateSpendingLimitInfo(
        address wallet,
        address operator,
        address token,
        SpendingLimitInfo memory spendingLimitInfo
    ) internal {
        _spendingLimit[_getKey(operator, token)][wallet] = spendingLimitInfo;
    }

    function _getSpendingLimitInfo(
        address wallet,
        address operator,
        address token
    ) internal view returns (SpendingLimitInfo memory) {
        return _spendingLimit[_getKey(operator, token)][wallet];
    }

    /**
     * @dev Sets the spending limit for the caller based on the provided SpendingLimitSetConfig.
     * @param config The SpendingLimitSetConfig to set the spending limit.
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
     * @param configs An array of SpendingLimitSetConfig objects.
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
