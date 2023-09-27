// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./BaseValidator.sol";
import "../../library/SignatureHandler.sol";

/**
 * @title ECDSAValidator
 */
contract ECDSAValidator is BaseValidator {
    using ECDSA for bytes32;

    event SignerSet(address indexed wallet, address indexed oldSigner, address indexed newSigner);

    mapping(address => address) private _signers;

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
        address signer = abi.decode(data, (address));
        _setSigner(signer, msg.sender);
    }

    /**
     * @dev Clears the wallet configuration for the calling wallet.
     * We don't clear signer info here.
     */
    function _clear() internal override {}

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @param wallet The wallet address to check.
     * @return A boolean indicating if the wallet is initialized.
     */
    function _isWalletInited(address wallet) internal view override returns (bool) {
        return _signers[wallet] != address(0);
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
        // Get the signature from the user operation
        SignatureHandler.SplitedSignature memory splitedSig = SignatureHandler.splitUserOpSignature(
            _userOp,
            _userOpHash
        );
        uint256 sigLength = _userOp.signature.length;
        // Instant transaction signature length: 20 bytes validator address + 1 byte sig type + 65 bytes signature
        // Scheduled transaction signature length: 20 bytes validator address + 1 byte sig type
        // + 12 bytes time range data + 64 bytes fee data + 65 bytes signature
        // The signature type must be INSTANT_TRANSACTION or SCHEDULE_TRANSACTION here
        if (
            (splitedSig.signatureType == SignatureHandler.INSTANT_TRANSACTION && sigLength != 86) ||
            (splitedSig.signatureType == SignatureHandler.SCHEDULE_TRANSACTION && sigLength != 162)
        ) {
            revert("Invalid signature length");
        }
        validationData = _validateSignature(
            _signers[_userOp.sender],
            splitedSig.signature,
            splitedSig.hash,
            splitedSig.validUntil,
            splitedSig.validAfter
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
    function isValidSignature(bytes32 hash, bytes calldata signature, address wallet) external view returns (bool) {
        address signer = _signers[wallet];
        _checkSigner(signer);
        // Normal ecrecover flow, EIP-712 signature should be in this case
        if (signer == hash.recover(signature)) {
            return true;
        }
        // `eth_sign` flow
        bytes32 messageHash = hash.toEthSignedMessageHash();
        if (signer == messageHash.recover(signature)) {
            return true;
        }
        return false;
    }

    /**
     * @dev Get the signer address for a given wallet.
     * @param wallet The address of the wallet.
     * @return The address of the signer.
     */
    function getSigner(address wallet) external view returns (address) {
        return _signers[wallet];
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
    ) internal pure returns (uint256) {
        _checkSigner(signer);
        uint256 sigFailed;
        bytes32 messageHash = hash.toEthSignedMessageHash();
        if (signer != messageHash.recover(signature)) {
            sigFailed = SIG_VALIDATION_FAILED;
        }
        return _packValidationData(sigFailed, validUntil, validAfter);
    }

    function _checkSigner(address signer) internal pure {
        require(signer != address(0), "Invalid signer of the wallet");
    }
}
