// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../../interface/IHooks.sol";
import "../../base/PluginManager.sol";

contract MockHooks is IHooks {
    bool public beforeTransactionCalled;
    bool public afterTransactionCalled;

    function initWalletConfig(bytes calldata) external override {}

    function clearWalletConfig() external override {}

    function beforeTransaction(
        address,
        uint256,
        bytes calldata,
        Enum.Operation
    ) external override {
        beforeTransactionCalled = true;
    }

    function afterTransaction(
        address,
        uint256,
        bytes calldata,
        Enum.Operation
    ) external override {
        afterTransactionCalled = true;
    }

    function hasHooks() external pure override returns (uint256) {
        return 1 << 128 | 1;
    }

    function supportsInterface(bytes4 interfaceId)
        external
        pure
        override
        returns (bool)
    {
        return interfaceId == type(IHooks).interfaceId;
    }

    function executeToWallet(address wallet, address to, uint256 value) external {
        PluginManager(wallet).execTransactionFromPluginReturnData(
            to,
            value,
            '0x',
            Enum.Operation.Call
        );
    }
}
