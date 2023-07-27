// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "../../plugin/validator/SessionKeyValidator/SessionkeyValidator.sol";

contract MockSessionKeyValidator is SessionKeyValidator {
    using SessionLib for Session;
    using SessionLib for OperatorPermission;
    using AllowanceCalldata for bytes;

    function isAllowedCalldata(bytes memory allowed, bytes memory data, uint256 value) external view returns (bool) {
        return allowed.isAllowedCalldata(data, value);
    }

    function checkAllowance(address wallet, address operator, address to, bytes memory data, uint256 value) external {
        return _checkAllowance(wallet, operator, to, data, value);
    }

    function testValidateSingleExecute(UserOperation memory userOp, bytes32 userOpHash) external returns (uint256) {
        return this.validateSingleExecute(userOp, userOpHash);
    }

    function testValidateBatchExecute(UserOperation memory userOp, bytes32 userOpHash) external returns (uint256) {
        return this.validateBatchExecute(userOp, userOpHash);
    }

    function testValidateOffchainPermit(
        address wallet,
        address operator,
        bytes32 permissionHash,
        bytes32 spendingLimitConfigHash,
        bytes memory ownerSignature
    ) external view returns (bool) {
        _validateOffchainPermitSignature(wallet, operator, permissionHash, spendingLimitConfigHash, ownerSignature);
        return true;
    }

    function testValidateSessionRoot(
        bytes32[] memory proof,
        bytes32 sessionRoot,
        Session memory session
    ) external pure returns (bool) {
        _validateSessionRoot(proof, sessionRoot, session.hash());
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

    function testValidatePaymaster(
        address wallet,
        address operator,
        bytes memory paymasterAndData
    ) external view returns (bool) {
        _validatePaymaster(wallet, operator, paymasterAndData);
        return true;
    }

    function testCheckAndUpdateUsage(address operator, UserOperation memory userOp, uint256 sessionsToUse) external {
        _checkAndUpdateUsage(operator, userOp, sessionsToUse);
    }
}
