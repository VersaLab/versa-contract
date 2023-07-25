// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

/**
 * @title OperatorSpendingAllowance
 */
abstract contract OperatorSpendingAllowance {
    using BytesLib for bytes;

    struct SpendingAllowanceConfig {
        address token;
        uint256 allowance;
    }

    event SetAllowance(address indexed wallet, address indexed operator, address indexed token, uint256 allowance);

    /// @dev ERC20 Token Method Selectors
    bytes4 internal constant TRANSFER = ERC20.transfer.selector;
    bytes4 internal constant TRANSFER_FROM = ERC20.transferFrom.selector;
    bytes4 internal constant APPROVE = ERC20.approve.selector;
    bytes4 internal constant INCREASE_ALLOWANCE = ERC20.increaseAllowance.selector;

    /// @dev Operator's allowance, keccak256(operator, token) => wallet => spendingAllowance
    mapping(bytes32 => mapping(address => uint256)) _spendingAllowance;

    /**
     * @dev check and update allowance of an session key execution
     */
    function _checkAllowance(address wallet, address operator, address to, bytes memory data, uint256 value) internal {
        // Check spending limit for native token
        if (value > 0) {
            _checkNativeTokenAllowance(wallet, operator, value);
        }
        // Check spending limit for ERC20 token
        if (data.length > 0) {
            _checkERC20TokenAllowance(wallet, operator, to, data);
        }
    }

    /**
     * @dev Sets the spending limit for the caller based on the provided AllowanceSetConfig.
     */
    function setAllowance(address operator, SpendingAllowanceConfig memory config) public virtual {
        _setAllowance(msg.sender, operator, config.token, config.allowance);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided AllowanceSetConfig array.
     */
    function batchSetAllowance(address operator, SpendingAllowanceConfig[] memory config) public virtual {
        _batchSetAllowance(msg.sender, operator, config);
    }

    /**
     * @dev Returns the spending limit info for the operator.
     */
    function getAllowance(address wallet, address operator, address token) public view returns (uint256) {
        return _getAllowance(wallet, operator, token);
    }

    /**
     * @dev Internal function to check the spending limit for native token.
     */
    function _checkNativeTokenAllowance(address wallet, address operator, uint256 value) internal {
        _checkAmountAndUpdate(wallet, operator, address(0), value);
    }

    /**
     * @dev Internal function to check the spending limit for an ERC20 token.
     */
    function _checkERC20TokenAllowance(address wallet, address operator, address token, bytes memory data) internal {
        uint256 spent;
        bytes4 selector = bytes4(data.slice(0, 4));
        bytes memory callData = data.slice(4, data.length - 4);
        if (selector == TRANSFER || selector == INCREASE_ALLOWANCE || selector == APPROVE) {
            (address to, uint256 value) = abi.decode(callData, (address, uint256));
            if (to != wallet) {
                spent = value;
            }
        } else if (selector == TRANSFER_FROM) {
            (address from, , uint256 value) = abi.decode(callData, (address, address, uint256));
            if (from == wallet) {
                spent = value;
            }
        }
        _checkAmountAndUpdate(wallet, operator, token, spent);
    }

    /**
     * @dev Internal function to check spent amount and update the spending limit information.
     */
    function _checkAmountAndUpdate(address wallet, address operator, address token, uint256 spent) internal {
        // Ensure that the spent amount does not exceed the allowance amount
        uint256 allowance = _getAllowance(wallet, operator, token);
        require(spent <= allowance, "OperatorAllowance: token overspending");
        _setAllowance(wallet, operator, token, allowance - spent);
    }

    /**
     * @dev Internal function to get Allowance info of an operator.
     */
    function _getAllowance(address wallet, address operator, address token) internal view returns (uint256) {
        return _spendingAllowance[_getKey(operator, token)][wallet];
    }

    /**
     * @dev Sets the spending limit for the operator based on the provided AllowanceSetConfig.
     */
    function _setAllowance(address wallet, address operator, address token, uint256 allowance) internal {
        _spendingAllowance[_getKey(operator, token)][wallet] = allowance;
        emit SetAllowance(wallet, operator, token, allowance);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided AllowanceSetConfig array.
     */
    function _batchSetAllowance(address wallet, address operator, SpendingAllowanceConfig[] memory config) internal {
        uint configLen = config.length;
        require(configLen > 0, "AllowanceHooks: dataLength should greater than zero");
        for (uint i = 0; i < configLen; i++) {
            _setAllowance(wallet, operator, config[i].token, config[i].allowance);
        }
    }

    function _getKey(address operator, address token) internal pure returns (bytes32) {
        return keccak256(abi.encode(operator, token));
    }
}
