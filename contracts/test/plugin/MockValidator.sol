// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../../interfaces/IModule.sol";
import "../../interfaces/IValidator.sol";

contract MockValidator is IValidator {
    function initWalletConfig(bytes calldata) external override {}

    function clearWalletConfig() external override {}

    function supportsInterface(bytes4 interfaceId)
        external
        pure
        override
        returns (bool)
    {
        return interfaceId == type(IValidator).interfaceId;
    }

    function validateSignature(UserOperation calldata _userOp, bytes32 _userOpHash)
        external
        view
        override
        returns (uint256 validationData)
    {
        // Mock implementation, always return 0 validation data
        return 0;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature, address wallet)
        external
        view
        override
        returns (uint256 validationData)
    {
        // Mock implementation, always return 0 validation data
        return 0;
    }
}
