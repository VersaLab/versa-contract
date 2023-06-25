// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "@aa-template/contracts/interfaces/UserOperation.sol";

library SignatureHandler {
    uint8 constant INSTANT_TRANSACTION = 0x00;
    uint8 constant SCHEDULE_TRANSACTION = 0x01;

    uint8 constant SIG_TYPE_OFFSET = 20;
    uint8 constant SIG_TYPE_LENGTH = 1;

    uint8 constant TIME_LENGTH = 6;
    uint8 constant VALID_UNTIL_OFFSET = 21;
    uint8 constant VALID_AFTER_OFFSET = VALID_UNTIL_OFFSET + TIME_LENGTH;

    uint8 constant FEE_LENGTH = 32;
    uint8 constant MAX_FEE_OFFSET = 33; // Valid after offet + time length
    uint8 constant MAX_PRIORITY_FEE_OFFSET = MAX_FEE_OFFSET + FEE_LENGTH;

    uint8 constant INSTANT_SIG_OFFSET = 21;
    uint8 constant SCHEDULE_SIG_OFFSET = MAX_PRIORITY_FEE_OFFSET + FEE_LENGTH;

    struct DecodedSignature {
        uint256 signatureType;
        bytes32 hash;
        bytes signature;
        uint256 validUntil;
        uint256 validAfter;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
    }

    function decodeUserOpSignature(
        UserOperation calldata _userOp,
        bytes32 _userOpHash
    ) pure internal returns(DecodedSignature memory decodedSig) {
        decodedSig.signatureType = uint8(bytes1(_userOp.signature[SIG_TYPE_OFFSET:SIG_TYPE_OFFSET + SIG_TYPE_LENGTH]));
        if (decodedSig.signatureType == INSTANT_TRANSACTION) {
            decodedSig.signature = _userOp.signature[INSTANT_SIG_OFFSET:];
            decodedSig.hash = _userOpHash;
        } else if (decodedSig.signatureType == SCHEDULE_TRANSACTION) {
            decodedSig.validUntil = uint48(bytes6(_userOp.signature[VALID_UNTIL_OFFSET:VALID_UNTIL_OFFSET + TIME_LENGTH]));
            decodedSig.validAfter = uint48(bytes6(_userOp.signature[VALID_AFTER_OFFSET:VALID_AFTER_OFFSET + TIME_LENGTH]));
            decodedSig.maxFeePerGas = uint256(bytes32(_userOp.signature[MAX_FEE_OFFSET:MAX_FEE_OFFSET + FEE_LENGTH]));
            decodedSig.maxPriorityFeePerGas = uint256(bytes32(_userOp.signature[MAX_PRIORITY_FEE_OFFSET:MAX_PRIORITY_FEE_OFFSET+FEE_LENGTH]));
            decodedSig.signature = _userOp.signature[SCHEDULE_SIG_OFFSET:];
            bytes memory extraData = abi.encode(decodedSig.validUntil, decodedSig.validAfter, decodedSig.maxFeePerGas, decodedSig.maxPriorityFeePerGas);
            decodedSig.hash = keccak256(abi.encode(_userOpHash, extraData));
        }
    }
}
