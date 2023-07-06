// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../../interface/IModule.sol";
import "../../base/ModuleManager.sol";

contract MockModule is IModule {
    function initWalletConfig(bytes calldata) external override {}

    function clearWalletConfig() external override {}

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IModule).interfaceId;
    }

    function executeToWallet(address wallet, address to, uint256 value) external {
        ModuleManager(wallet).execTransactionFromModuleReturnData(to, value, "0x", Enum.Operation.Call);
    }
}
