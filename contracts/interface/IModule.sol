// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IModule is IERC165 {
    function initWalletConfig(bytes memory data) external;

    function clearWalletConfig() external;
}
