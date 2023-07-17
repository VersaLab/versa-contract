// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "../../interface/IModule.sol";
import "../../interface/IValidator.sol";

contract MockValidator is IValidator {
    bytes4 internal constant UPDATED_MAGIC_VALUE = 0x1626ba7e;

    function initWalletConfig(bytes calldata) external override {}

    function clearWalletConfig() external override {}

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IValidator).interfaceId;
    }

    function validateSignature(
        UserOperation calldata _userOp,
        bytes32 _userOpHash
    ) external pure override returns (uint256 validationData) {
        (_userOp, _userOpHash);
        // Mock implementation, always return 0 validation data
        return 0;
    }

    function isValidSignature(
        bytes32 hash,
        bytes calldata signature,
        address wallet
    ) external pure override returns (bool) {
        (hash, signature, wallet);
        // Mock implementation, always return true validation data
        return true;
    }
}

contract MockValidator2 is IValidator {
    bytes4 internal constant UPDATED_MAGIC_VALUE = 0x1626ba7e;

    function initWalletConfig(bytes calldata) external override {}

    function clearWalletConfig() external override {
        revert("Unsupported function");
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IValidator).interfaceId;
    }

    function validateSignature(
        UserOperation calldata _userOp,
        bytes32 _userOpHash
    ) external pure override returns (uint256 validationData) {
        (_userOp, _userOpHash);
        // Mock implementation, always return 1 validation data
        return 1;
    }

    function isValidSignature(
        bytes32 hash,
        bytes calldata signature,
        address wallet
    ) external pure override returns (bool) {
        (hash, signature, wallet);
        // Mock implementation, always return false validation data
        return false;
    }
}
