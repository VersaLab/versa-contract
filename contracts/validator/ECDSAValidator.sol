// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "./BaseValidator.sol";
import "../libraries/SignatureHandler.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ECDSAValidator is BaseValidator {
    using ECDSA for bytes32;

    event SignerSet(address indexed wallet, address indexed oldSigner, address indexed newSigner);

    mapping (address => address) private _signers;

    function setSigner(address newSigner) external onlyEnabledValidator {
        _setSigner(newSigner, msg.sender);
    }

    function _setSigner(address newSigner, address wallet) internal {
        require(newSigner != address(0), "Invalid signer address");
        address oldSigner = _signers[wallet];
        _signers[wallet] = newSigner;
        emit SignerSet(wallet, oldSigner, newSigner);
    }

    function _init(bytes memory data) internal override {
        (address signer) = abi.decode(data, (address));
        _setSigner(signer, msg.sender);
    }

    function _clear() internal override {
        delete _signers[msg.sender];
    }

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

    function getSigner(address wallet) external view returns(address) {
        return _signers[wallet];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IValidator).interfaceId;
    }

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

    function _packValidationData(uint256 sigFailed, uint256 validUntil, uint256 validAfter) internal pure returns (uint256) {
        return sigFailed | validUntil << 160 | validAfter << (160 + 48);
    }

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
