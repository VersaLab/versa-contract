// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.17;

import "../common/Enum.sol";
import "../common/Executor.sol";
import "../base/HookManager.sol";
import "../base/ModuleManager.sol";
import "../base/ValidatorManager.sol";

abstract contract PluginManager is Executor, HookManager, ModuleManager, ValidatorManager {
    event ExecutionFromPluginSuccess(address indexed plugin);
    event ExecutionFromPluginFailure(address indexed plugin);

    /**
     * @notice Execute `operation` (0: Call, 1: DelegateCall) to `to` with `value` (Native Token)
     * @dev Function is virtual to allow overriding for L2 singleton to emit an event for indexing.
     * @notice Subclass must override _checkPluginEnabled to make sure plugin is enabled.
     * @param to Destination address of module transaction.
     * @param value Ether value of module transaction.
     * @param data Data payload of module transaction.
     * @param operation Operation type of module transaction.
     * @return success Boolean flag indicating if the call succeeded.
     */
    function execTransactionFromPlugin(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) public virtual returns (bool success) {
        require(_isPluginEnabled(msg.sender), "Only enabled plugin");
        // Execute transaction without further confirmations.
        success = execute(to, value, data, operation, type(uint256).max);
        if (success) emit ExecutionFromPluginSuccess(msg.sender);
        else emit ExecutionFromPluginFailure(msg.sender);
    }

    /**
     * @notice Execute `operation` (0: Call, 1: DelegateCall) to `to` with `value` (Native Token) and return data
     * @param to Destination address of module transaction.
     * @param value Ether value of module transaction.
     * @param data Data payload of module transaction.
     * @param operation Operation type of module transaction.
     * @return success Boolean flag indicating if the call succeeded.
     * @return returnData Data returned by the call.
     */
    function execTransactionFromPluginReturnData(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) public returns (bool success, bytes memory returnData) {
        success = execTransactionFromPlugin(to, value, data, operation);
        returnData = getReturnData(type(uint256).max);
    }

    function _isPluginEnabled(address plugin) internal virtual view returns(bool) {
        return
            isModuleEnabled(plugin) || isHooksEnabled(plugin) || isValidatorEnabled(plugin);
    }
}
