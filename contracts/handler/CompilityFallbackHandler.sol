// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "@aa-template/contracts/core/Helpers.sol";
import "./TokenCallbackHandler.sol";
import "../interfaces/IERC1271.sol";
import "../interfaces/IValidator.sol";
import "../base/ValidatorManager.sol";

/**
 * @title CompilityFallbackHandler
 * @notice A contract that handles compatibility fallback operations for token callbacks.
 */
contract CompilityFallbackHandler is TokenCallbackHandler, IERC1271 {
    /**
     * @notice Validates the provided signature for a given hash.
     * @param _hash The hash of the data to be signed.
     * @param _signature The signature byte array associated with the hash.
     * @return magicValue The bytes4 magic value of ERC1721.
     */
    function isValidSignature(bytes32 _hash, bytes calldata _signature)
        public
        override
        view
        returns (bytes4 magicValue)
    {
        address validator = address(bytes20(_signature[:20]));
        require(
            ValidatorManager(msg.sender).getValidatorType(validator) == ValidatorManager.ValidatorType.Sudo,
            "Only Sudo validator"
        );
        uint256 validationData = IValidator(validator).isValidSignature(_hash, _signature, msg.sender);
        ValidationData memory data = _parseValidationData(validationData);
        if (data.validAfter > block.timestamp || data.validUntil < block.timestamp) {
            return 0xffffffff;
        }
        if (data.aggregator != address(0)) {
            return 0xffffffff;
        }
        return EIP1271_MAGIC_VALUE;
    }
}
