// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "@aa-template/contracts/core/Helpers.sol";
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
    function isValidSignature(bytes32 _hash, bytes calldata _signature)
        public
        override
        view
        returns (bytes4 magicValue)
    {
        (uint256 sudoValidatorSize, ) = ValidatorManager(msg.sender).validatorSize();
        address[] memory sudoValidators = ValidatorManager(msg.sender).getValidatorsPaginated(
            address(1),
            sudoValidatorSize,
            ValidatorManager.ValidatorType.Sudo
        );
        for (uint256 i = 0; i < sudoValidatorSize; ++i) {
            try IValidator(sudoValidators[i]).isValidSignature(
                _hash,
                _signature,
                msg.sender
            ) returns (bool isValid) {
                if (!isValid) {
                    magicValue = 0xffffffff;
                } else {
                    return EIP1271_MAGIC_VALUE;
                }
            } catch  { magicValue = 0xffffffff; }
        }
    }
}
