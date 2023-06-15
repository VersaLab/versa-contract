// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IModule is IERC165 {
    function initWalletConfig(bytes calldata data) external;

    function clearWalletConfig() external;
}