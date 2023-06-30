// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../../interface/IModule.sol";

contract MockModule is IModule {
    function initWalletConfig(bytes calldata) external override {}

    function clearWalletConfig() external override {}

    function supportsInterface(bytes4 interfaceId)
        external
        pure
        override
        returns (bool)
    {
        return interfaceId == type(IModule).interfaceId;
    }
}
