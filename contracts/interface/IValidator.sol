// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@aa-template/contracts/interfaces/UserOperation.sol";
import "./IModule.sol";

interface IValidator is IModule {
    function validateSignature(
        UserOperation calldata _userOp,
        bytes32 _userOpHash
    ) external view returns (uint256 validationData);

    function isValidSignature(bytes32 hash, bytes calldata signature, address wallet) external view returns (bool);
}
