// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "../../base/PluginManager.sol";

contract MockPluginManager is PluginManager {
    function execute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external {
        executeAndRevert(to, value, data, operation);
    }
}