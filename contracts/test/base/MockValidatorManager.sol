// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "../../base/ValidatorManager.sol";
import "../../base/FallbackManager.sol";
import "../../common/Executor.sol";

contract MockValidatorManager is ValidatorManager, FallbackManager, Executor {
    function updateFallbackHandler(address handler) external {
        internalSetFallbackHandler(handler);
    }

    function execute(address to, uint256 value, bytes memory data, Enum.Operation operation) external {
        executeAndRevert(to, value, data, operation);
    }
}
