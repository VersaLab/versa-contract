// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

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
    uint8 constant MAX_FEE_OFFSET = 33;
    uint8 constant MAX_PRIORITY_FEE_OFFSET = MAX_FEE_OFFSET + FEE_LENGTH;

    uint8 constant INSTANT_SIG_OFFSET = 21;
    uint8 constant SCHEDULE_SIG_OFFSET = MAX_PRIORITY_FEE_OFFSET + FEE_LENGTH;

    address constant ENTRYPOINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    // Memory struct for decoded userOp signature
    struct SplitedSignature {
        uint256 signatureType;
        bytes32 hash;
        bytes signature;
        uint256 validUntil;
        uint256 validAfter;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
    }

    /*
        User operation's signature field(for ECDSA and Multisig validator):
        +-----------------------------+-------------------------------------------------------------------------+
        |       siganture type        |                        signature layout                                 |
        +---------------------------------------------+---------------+-----------------------------------------+
        | instant transaction (0x00)  | validatorAddr | signatureType |             signatureField              |
        |                             |    20 bytes   |    1 byte     |                 n bytes                 |
        +-------------------------------------------------------------------------+----------+------------------+
        | scheduled transaction(0x01) | validatorAddr | signatureType | timeRange |  feeData |   signatureField |
        |                             |    20 bytes   |    1 byte     | 12 bytes  | 64 bytes |     n bytes      |
        +-----------------------------+---------------+---------------+-----------+----------+------------------+
        
        timeRange: validUntil(6 bytes) and validAfter(6 bytes)
        feeData:   maxFeePerGas(32 bytes) and maxPriorityFeePerGas(32 bytes)
    */

    /**
     * @notice Decode the user operation signature and extract relevant information.
     * @param userOp The UserOperation struct containing the signature.
     * @param userOpHash The hash of the user operation.
     * @return splitedSig The SplitedSignature struct with decoded signature information.
     */
    function splitUserOpSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) internal pure returns (SplitedSignature memory splitedSig) {
        address validator = address(bytes20(userOp.signature[0:20]));
        splitedSig.signatureType = uint8(bytes1(userOp.signature[SIG_TYPE_OFFSET:SIG_TYPE_OFFSET + SIG_TYPE_LENGTH]));
        // For instant transactions, the signature start from the 22th bytes of the userOp.signature.
        if (splitedSig.signatureType == INSTANT_TRANSACTION) {
            splitedSig.signature = userOp.signature[INSTANT_SIG_OFFSET:];
            splitedSig.hash = keccak256(abi.encode(userOpHash, validator));
        } else if (splitedSig.signatureType == SCHEDULE_TRANSACTION) {
            // For scheduled transactions, decode the individual fields from the signature.
            splitedSig.validUntil = uint48(
                bytes6(userOp.signature[VALID_UNTIL_OFFSET:VALID_UNTIL_OFFSET + TIME_LENGTH])
            );
            splitedSig.validAfter = uint48(
                bytes6(userOp.signature[VALID_AFTER_OFFSET:VALID_AFTER_OFFSET + TIME_LENGTH])
            );
            splitedSig.maxFeePerGas = uint256(bytes32(userOp.signature[MAX_FEE_OFFSET:MAX_FEE_OFFSET + FEE_LENGTH]));
            splitedSig.maxPriorityFeePerGas = uint256(
                bytes32(userOp.signature[MAX_PRIORITY_FEE_OFFSET:MAX_PRIORITY_FEE_OFFSET + FEE_LENGTH])
            );
            splitedSig.signature = userOp.signature[SCHEDULE_SIG_OFFSET:];
            // Calculate the hash of the scheduled transaction using the extra data fields.
            bytes memory extraData = abi.encode(
                splitedSig.validUntil,
                splitedSig.validAfter,
                splitedSig.maxFeePerGas,
                splitedSig.maxPriorityFeePerGas
            );
            require(
                userOp.maxFeePerGas <= splitedSig.maxFeePerGas
                && userOp.maxPriorityFeePerGas <= splitedSig.maxPriorityFeePerGas,
                "SignatureHandler: Invalid scheduled transaction gas fee"
            );
            splitedSig.hash = keccak256(abi.encode(getScheduledOpHash(userOp), validator, extraData));
        } else {
            revert("SignatureHandler: invalid signature type");
        }
    }

    function pack(UserOperation calldata userOp) internal pure returns (bytes memory ret) {
        address sender = UserOperationLib.getSender(userOp);
        uint256 nonce = userOp.nonce;
        bytes32 hashInitCode = calldataKeccak(userOp.initCode);
        bytes32 hashCallData = calldataKeccak(userOp.callData);
        uint256 callGasLimit = userOp.callGasLimit;
        uint256 verificationGasLimit = userOp.verificationGasLimit;
        uint256 preVerificationGas = userOp.preVerificationGas;
        bytes32 hashPaymasterAndData = calldataKeccak(userOp.paymasterAndData);

        return abi.encode(
            sender, nonce,
            hashInitCode, hashCallData,
            callGasLimit, verificationGasLimit, preVerificationGas,
            hashPaymasterAndData
        );
    }

    function getScheduledOpHash(UserOperation calldata userOp) internal view returns (bytes32) {
        bytes32 packHash = keccak256(pack(userOp));
        return keccak256(abi.encode(packHash, ENTRYPOINT, block.chainid));
    }

    /**
     * @dev divides bytes ecdsa signatures into `uint8 v, bytes32 r, bytes32 s` from `pos`.
     * @notice Make sure to perform a bounds check for @param pos, to avoid out of bounds access on @param signatures
     * @param pos which signature to read. A prior bounds check of this parameter should be performed, to avoid out of bounds access
     * @param signatures concatenated rsv signatures
     */
    function multiSignatureSplit(
        bytes memory signatures,
        uint256 pos
    ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        // The signature format is a compact form of:
        // {bytes32 r} {bytes32 s} {uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let signaturePos := mul(0x41, pos)
            // signatures data start from signaturesOffset + 0x20(signature length)
            r := mload(add(signaturePos, add(signatures, 0x20)))
            s := mload(add(signaturePos, add(signatures, 0x40)))
            v := byte(0, mload(add(signaturePos, add(signatures, 0x60))))
        }
    }
}
