// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "../../base/HooksManager.sol";
import "../../common/Executor.sol";

contract MockHooksManager is HooksManager, Executor {
    function execute(address to, uint256 value, bytes memory data, Enum.Operation operation) external {
        _beforeTransaction(to, value, data, operation);
        executeAndRevert(to, value, data, operation);
        _afterTransaction(to, value, data, operation);
    }
}
