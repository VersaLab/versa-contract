// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "solidity-rlp/contracts/RLPReader.sol";

uint256 constant ANY = 0;
uint256 constant NE = 1;
uint256 constant EQ = 2;
uint256 constant GT = 3;
uint256 constant LT = 4;
uint256 constant AND = 5;
uint256 constant OR = 6;

/**
 * @title AllowanceCalldata
 * @notice This contract is modified from https://github.com/permissivelabs/core/blob/main/src/core/AllowanceCalldata.sol
 */
library AllowanceCalldata {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    /**
     * @notice isAllowedCalldata - checks the calldata is valid corresponding the the allowed calldata conditions.
     * @param allowed The RLP encoded Allowed calldata
     * @param data The RLP encoded calldata
     * @dev To check the msg.value field, the first arg of data must be equal to msg.value and the first arg of allowed calldata must set rules for the value
     * @return In case of success returns true, otherwise fails or reverts
     */
    function isAllowedCalldata(bytes memory data, bytes memory allowed) internal view returns (bool) {
        RLPReader.RLPItem[] memory allowedArguments = allowed.toRlpItem().toList();
        RLPReader.RLPItem[] memory arguments = data.toRlpItem().toList();
        require(allowedArguments.length == arguments.length, "Invalid arguments length");
        return _validateArguments(allowedArguments, arguments, false);
    }

    /**
     * @notice rlpToABI - Transform the RLP encoded calldata into ABI
     * @dev the RLP calldata must already be ABI compatible when all arguments are concatenated
     * @dev If you have n arguments to verify (including value)
     * @dev You need to have n arguments in the RLP calldata
     * @dev And when concatenated, the arguments must be ABI compatible
     * @dev So if you have 1 argument to check (ignore value for the example)
     * @dev it must be RLP.encode([abi.encode(argument)])
     * @param data the RLP encoded calldata
     * @return abiEncoded The result ABI encoded, is valid calldata
     */
    function rlpToABI(bytes memory data) internal pure returns (bytes memory abiEncoded) {
        RLPReader.RLPItem[] memory arguments = data.toRlpItem().toList();
        for (uint256 i = 0; i < arguments.length; i = _unsafeInc(i)) {
            abiEncoded = bytes.concat(abiEncoded, arguments[i].toBytes());
        }
    }

    /**
     * @notice _validateArguments - Core function of the AllowanceCalldata library, checks if arguments respect the allowedArguments conditions
     * @param allowedArguments The allowed arguments
     * @param arguments The arguments
     * @param isOr Is the current loop in a or condition
     * @dev isOr is used to do the minimum checks
     * @dev in case of AND = a single false result breaks
     * @dev in case of OR = a single true result breaks
     */
    function _validateArguments(
        RLPReader.RLPItem[] memory allowedArguments,
        RLPReader.RLPItem[] memory arguments,
        bool isOr
    ) internal view returns (bool canPass) {
        if (allowedArguments.length == 0) return true;
        for (uint256 i = 0; i < allowedArguments.length; i = _unsafeInc(i)) {
            RLPReader.RLPItem[] memory prefixAndArg = allowedArguments[i].toList();
            uint256 prefix = prefixAndArg[0].toUint();

            if (prefix == ANY) {
                canPass = true;
            } else if (prefix == EQ) {
                bytes memory allowedArgument = prefixAndArg[1].toBytes();
                bytes memory argument = arguments[i].toBytes();
                canPass = keccak256(allowedArgument) == keccak256(argument);
            } else if (prefix == LT) {
                uint256 allowedArgument = prefixAndArg[1].toUint();
                uint256 argument = arguments[i].toUint();
                canPass = argument < allowedArgument;
            } else if (prefix == GT) {
                uint256 allowedArgument = prefixAndArg[1].toUint();
                uint256 argument = arguments[i].toUint();
                canPass = argument > allowedArgument;
            } else if (prefix == OR) {
                RLPReader.RLPItem[] memory subAllowance = prefixAndArg[1].toList();
                canPass = _validateArguments(subAllowance, _fillArray(arguments, i, subAllowance.length), true);
            } else if (prefix == NE) {
                bytes memory allowedArgument = prefixAndArg[1].toBytes();
                bytes memory argument = arguments[i].toBytes();
                canPass = keccak256(allowedArgument) != keccak256(argument);
            } else if (prefix == AND) {
                RLPReader.RLPItem[] memory subAllowance = prefixAndArg[1].toList();
                canPass = _validateArguments(subAllowance, _fillArray(arguments, i, subAllowance.length), false);
            } else {
                revert("Invalid calldata prefix");
            }

            if (!isOr && !canPass) break;
            if (canPass && isOr) break;
        }
        return canPass;
    }

    /**
     * @notice optimized incrementation
     */
    function _unsafeInc(uint256 i) internal pure returns (uint256) {
        unchecked {
            return i + 1;
        }
    }

    /**
     * @notice _fillArray - Creates a new array filled with the same item
     * @param arguments Array of arguments to take the item from
     * @param index The index of the item to fill with
     * @param length The length of the new filled array
     */
    function _fillArray(
        RLPReader.RLPItem[] memory arguments,
        uint256 index,
        uint256 length
    ) internal pure returns (RLPReader.RLPItem[] memory newArguments) {
        assembly {
            newArguments := mload(0x40)
            mstore(0x40, add(newArguments, 0x20))
            mstore(newArguments, length)
            let hit := mul(add(length, 1), 0x20)
            let memStart := add(arguments, mul(index, 0x20))
            for {
                let i := 0x20
            } lt(i, hit) {
                i := add(i, 0x20)
            } {
                mstore(add(newArguments, i), mload(add(memStart, 0x20)))
            }
            mstore(0x40, add(mload(0x40), mul(length, 0x20)))
        }
    }
}
