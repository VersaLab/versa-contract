// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "./TokenCallbackHandler.sol";
import "../interface/IERC1271.sol";
import "../interface/IValidator.sol";
import "../base/ValidatorManager.sol";

/**
 * @title CompatibilityFallbackHandler
 * @notice A contract that handles compatibility fallback operations for token callbacks.
 */
contract CompatibilityFallbackHandler is TokenCallbackHandler, IERC1271 {
    /**
     * @notice Validates the provided signature for a given hash,
     * this function is not gas optimized and is not supposed to be called on chain.
     * @param _hash The hash of the data to be signed.
     * @param _signature The signature byte array associated with the hash.
     * @return magicValue The bytes4 magic value of ERC1721.
     */
    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view override returns (bytes4 magicValue) {
        address validator = address(bytes20(_signature[0:20]));
        require(
            ValidatorManager(msg.sender).getValidatorType(validator) == ValidatorManager.ValidatorType.Sudo,
            "E200"
        );
        bool isValid = IValidator(validator).isValidSignature(_hash, _signature[20:], msg.sender);
        return isValid ? EIP1271_MAGIC_VALUE : bytes4(0xffffffff);
    }
}
