// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../../base/ModuleManager.sol";
import "../../interface/IModule.sol";

contract MockModuleManager is ModuleManager {
    function execute(address to, uint256 value, bytes memory data, Enum.Operation operation) external {
        executeAndRevert(to, value, data, operation);
    }
}
