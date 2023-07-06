// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../../base/ValidatorManager.sol";
import "../../common/Executor.sol";

contract MockValidatorManager is ValidatorManager, Executor {
    function execute(address to, uint256 value, bytes memory data, Enum.Operation operation) external {
        executeAndRevert(to, value, data, operation);
    }
}
