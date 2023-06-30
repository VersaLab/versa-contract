// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./IModule.sol";
import "../common/Enum.sol";

interface IHooks is IModule {
    function hasHooks() external view returns(uint256);

    function beforeTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external;

    function afterTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external;
}
