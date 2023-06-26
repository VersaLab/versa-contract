// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./BaseValidator.sol";
import "../libraries/SignatureHandler.sol";

/**
 * @title ECDSAValidator
 */
contract ECDSAValidator is BaseValidator {
    using ECDSA for bytes32;

    event SignerSet(address indexed wallet, address indexed oldSigner, address indexed newSigner);

    mapping (address => address) private _signers;

    /**
     * @dev Sets a new signer for the calling wallet.
     * @param newSigner The address of the new signer.
     */
    function setSigner(address newSigner) external onlyEnabledValidator {
        _setSigner(newSigner, msg.sender);
    }

    /**
     * @dev Internal function to set a new signer for a specific wallet.
     * @param newSigner The address of the new signer.
     * @param wallet The address of the wallet.
     */
    function _setSigner(address newSigner, address wallet) internal {
        require(newSigner != address(0), "Invalid signer address");
        address oldSigner = _signers[wallet];
        _signers[wallet] = newSigner;
        emit SignerSet(wallet, oldSigner, newSigner);
    }

    /**
     * @dev Initializes the wallet configuration for the calling wallet.
     * @param data The initialization data containing the signer address.
     */
    function _init(bytes memory data) internal override {
        (address signer) = abi.decode(data, (address));
        _setSigner(signer, msg.sender);
    }

    /**
     * @dev Clears the wallet configuration for the calling wallet.
     */
    function _clear() internal override {
        delete _signers[msg.sender];
    }

    /**
     * @dev Validates the signature of a user operation.
     * @param _userOp The user operation data.
     * @param _userOpHash The hash of the user operation.
     * @return validationData The validation data.
     */
    function validateSignature(
        UserOperation calldata _userOp,
        bytes32 _userOpHash
    ) external view returns (uint256 validationData) {
        uint256 sigLength = _userOp.signature.length;
        // 20 bytes validator address + 1 byte sig type + 65 bytes signature
        // 20 bytes validator address + 1 byte sig type
        // + 12 bytes time range data + 64 bytes fee data + 65 bytes signature
        if (sigLength != 86 && sigLength != 162) {
            return SIG_VALIDATION_FAILED;
        }
        SignatureHandler.DecodedSignature memory decodedSig =
            SignatureHandler.decodeUserOpSignature(_userOp, _userOpHash);
        if (!_checkDecodedSig(
            decodedSig.signatureType,
            decodedSig.maxFeePerGas,
            decodedSig.maxPriorityFeePerGas,
            _userOp.maxFeePerGas,
            _userOp.maxPriorityFeePerGas
        )) {
            return SIG_VALIDATION_FAILED;
        }
        validationData = _validateSignature(
            _signers[_userOp.sender],
            decodedSig.signature,
            decodedSig.hash,
            decodedSig.validUntil,
            decodedSig.validAfter
        );
    }

    /**
     * @dev Checks if a signature is valid for a given hash and wallet,
     * this is used to support EIP-1271 protocol.
     * @param hash The hash to validate the signature against.
     * @param signature The signature to validate.
     * @param wallet The address of the wallet.
     * @return A boolean indicating whether the signature is valid or not.
     */
    function isValidSignature(
        bytes32 hash,
        bytes calldata signature,
        address wallet
    ) external view returns(bool) {
        uint256 validUntil;
        uint256 validAfter;
        address signer = _signers[wallet];
        uint256 validationData = _validateSignature(
            signer,
            signature,
            hash,
            validUntil,
            validAfter
        );
        return validationData == 0 ? true : false;
    }

    /**
     * @dev Get the signer address for a given wallet.
     * @param wallet The address of the wallet.
     * @return The address of the signer.
     */
    function getSigner(address wallet) external view returns(address) {
        return _signers[wallet];
    }

    /**
     * @dev Inherits from ERC165.
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IValidator).interfaceId;
    }

    /**
     * @dev Internal function to validate a signature.
     * @param signer The address of the signer.
     * @param signature The signature to validate.
     * @param hash The hash to validate the signature against.
     * @param validUntil The valid until timestamp.
     * @param validAfter The valid after timestamp.
     * @return The validation data indicating the result of the signature validation.
     */
    function _validateSignature(
        address signer,
        bytes memory signature,
        bytes32 hash,
        uint256 validUntil,
        uint256 validAfter
    ) internal pure returns(uint256) {
        uint256 sigFailed;
        bytes32 messageHash = hash.toEthSignedMessageHash();
        if (signer != messageHash.recover(signature)) {
            sigFailed = SIG_VALIDATION_FAILED;
        }
        return _packValidationData(sigFailed, validUntil, validAfter);
    }

    /**
     * @dev Pack the validation data.
     * @param sigFailed The signature validation result.
     * @param validUntil The valid until timestamp.
     * @param validAfter The valid after timestamp.
     * @return The packed validation data.
     */
    function _packValidationData(uint256 sigFailed, uint256 validUntil, uint256 validAfter) internal pure returns (uint256) {
        return sigFailed | validUntil << 160 | validAfter << (160 + 48);
    }

    /**
     * @dev Check the decoded signature.
     * @param sigType The signature type.
     * @param maxFeePerGas The maximum fee per gas.
     * @param maxPriorityFeePerGas The maximum priority fee per gas.
     * @param actualMaxFeePerGas The actual maximum fee per gas from the user operation.
     * @param actualMaxPriorityFeePerGas The actual maximum priority fee per gas from the user operation.
     * @return A boolean indicating whether the decoded signature is valid or not.
     */
    function _checkDecodedSig(
        uint256 sigType,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 actualMaxFeePerGas,
        uint256 actualMaxPriorityFeePerGas
    ) pure internal returns(bool) {
        if (sigType != 0x00 && sigType != 0x01) {
            return false;
        }
        if (sigType == 0x01
            && (actualMaxFeePerGas >= maxFeePerGas || actualMaxPriorityFeePerGas >= maxPriorityFeePerGas)) {
            return false;
        }
        return true;
    }
}
