// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "../../plugin/validator/SessionkeyValidator.sol";

contract MockSessionKeyValidator is SessionKeyValidator {
    using SessionLib for Session;
    using AllowanceCalldata for bytes;

    function isAllowedCalldata(bytes memory allowed, bytes memory data, uint256 value) external view returns (bool) {
        return allowed.isAllowedCalldata(data, value);
    }

    function testValidateSingleExecute(UserOperation memory userOp, bytes32 userOpHash) external returns (uint256) {
        return this.validateSingleExecute(userOp, userOpHash);
    }

    function testValidateBatchExecute(UserOperation memory userOp, bytes32 userOpHash) external returns (uint256) {
        return this.validateBatchExecute(userOp, userOpHash);
    }

    function testValidateSessionRoot(
        bytes32[] memory proof,
        bytes32 sessionRoot,
        Session memory session
    ) external view returns (bool) {
        _validateSessionRoot(proof, sessionRoot, session.hash());
        return true;
    }

    function testValidateSessionRootGivenHash(
        bytes32[] memory proof,
        bytes32 sessionRoot,
        bytes32 sessionHash
    ) external returns (bool) {
        _validateSessionRoot(proof, sessionRoot, sessionHash);
        return true;
    }

    function testValidateOperatorGasUsage(address operator, UserOperation memory userOp) external returns (bool) {
        _validateOperatorGasUsage(operator, userOp);
        return true;
    }

    function testCheckArguments(
        Session memory session,
        address to,
        bytes memory data,
        uint256 value,
        bytes memory rlpCalldata
    ) external view returns (bool) {
        _checkArguments(session, to, data, value, rlpCalldata);
        return true;
    }

    function testValidatePaymaster(address paymaster, address actualPaymaster) external pure returns (bool) {
        _validatePaymaster(paymaster, actualPaymaster);
        return true;
    }

    function testGetValidationIntersection(
        uint48 validUntil1,
        uint48 validUntil2,
        uint48 validAfter1,
        uint48 validAfter2
    ) external pure returns (uint48, uint48) {
        return _getValidationIntersection(validUntil1, validUntil2, validAfter1, validAfter2);
    }
}
