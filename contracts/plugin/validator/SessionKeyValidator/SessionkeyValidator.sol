// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "../../../common/SelfAuthorized.sol";
import "./OperatorSpendingAllowance.sol";
import "../BaseValidator.sol";
import "../../../common/AllowanceCalldata.sol";
import "../../../VersaWallet.sol";
import "../../../base/ValidatorManager.sol";

/**
 * @dev A session is delegated by a wallet to an operator for specific use.
 */
struct Session {
    // Allowed address to call
    address to;
    // Allowed function selector
    bytes4 selector;
    // Allowed arguments
    bytes allowedArguments;
}

/**
 * @dev Permissions and restrictions for an operator
 */
struct OperatorPermission {
    // The root of the merkle tree of all sessions
    bytes32 sessionRoot;
    // The paymaster allowed to use
    address paymaster;
    // The timestamp when the permission is expired, 0 for infinite
    uint48 validUntil;
    // The timestamp when the permission is valid
    uint48 validAfter;
    // The gas limit for the operator
    uint128 gasRemaining;
    // The times limit for the operator
    uint128 timesRemaining;
}

library SessionLib {
    /**
     * @dev Returns the hash of a session.
     */
    function hash(Session memory session) internal pure returns (bytes32 sessionHash) {
        sessionHash = keccak256(abi.encode(session.to, session.selector, session.allowedArguments));
    }

    /**
     * @dev Returns the hash of a operator permission.
     */
    function hash(OperatorPermission memory permission) internal pure returns (bytes32 permissionHash) {
        permissionHash = keccak256(
            abi.encode(
                permission.sessionRoot,
                permission.paymaster,
                permission.validUntil,
                permission.validAfter,
                permission.gasRemaining,
                permission.timesRemaining
            )
        );
    }
}

/**
 * @title SessionKeyValidator
 * @dev Contract that handles validation of user operations using session keys.
 * This contract is inspired by https://github.com/permissivelabs/core
 */
contract SessionKeyValidator is BaseValidator, OperatorSpendingAllowance, SelfAuthorized {
    using AllowanceCalldata for bytes;
    using ECDSA for bytes32;
    using SessionLib for Session;
    using SessionLib for OperatorPermission;
    using BytesLib for bytes;

    /// @dev Emit on an oepraotr permission set
    event OperatorPermissionSet(address indexed wallet, address indexed operator, OperatorPermission permission);
    /// @dev Emit on a session used
    event SessionUsed(address indexed wallet, address indexed operator, bytes32 indexed sessionHash);

    /// @dev The operator permission for each wallet
    mapping(address operator => mapping(address wallet => OperatorPermission)) internal _operatorPermission;

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @notice This validator is supposed to be enabled during wallet initialization without performing
     * validator initialization.
     * @return A boolean indicating if the wallet is initialized.
     */
    function _isWalletInited(address) internal pure override returns (bool) {
        return true;
    }

    /**
     * @dev Sets the operator permission for the wallet.
     */
    function setOperatorPermission(
        address operator,
        OperatorPermission memory permission
    ) external onlyEnabledValidator {
        _setOperatorPermission(msg.sender, operator, permission);
    }

    /**
     * @dev Valdiate the signature of the user operation.
     */
    function validateSignature(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) external onlyEnabledValidator returns (uint256 validationData) {
        // Split on normal execute and batch normal execute
        if (bytes4(userOp.callData.slice(0, 4)) == VersaWallet.normalExecute.selector) {
            try this.validateSingleExecute(userOp, userOpHash) returns (uint256 data) {
                validationData = data;
            } catch {
                validationData = SIG_VALIDATION_FAILED;
            }
        } else if (bytes4(userOp.callData.slice(0, 4)) == VersaWallet.batchNormalExecute.selector) {
            try this.validateBatchExecute(userOp, userOpHash) returns (uint256 data) {
                validationData = data;
            } catch {
                validationData = SIG_VALIDATION_FAILED;
            }
        } else {
            validationData = SIG_VALIDATION_FAILED;
        }
    }

    /**
     * @dev Valdiate the normal execute user operation.
     * Requirements:
     * - the userOp must be signed by the operator
     * - the session must be in the session merkle tree
     * - the paymaster must be equal to pre-set paymaster
     * - must not execeed the spending limit
     * - the calldata must be in the range of pre-set allowed arguments
     */
    function validateSingleExecute(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) public authorized returns (uint256 validationData) {
        // Decode calldata from userOp.calldata
        (address to, uint256 value, bytes memory data, ) = abi.decode(
            userOp.callData.slice(4, userOp.callData.length - 4),
            (address, uint256, bytes, uint8)
        );
        // Decode extra data from signature
        (
            bytes32[] memory proof,
            address operator,
            Session memory session,
            bytes memory rlpCalldata,
            bytes memory operatorSignature
        ) = abi.decode(
                userOp.signature.slice(20, userOp.signature.length - 20),
                (bytes32[], address, Session, bytes, bytes)
            );
        _validateOperatorSiganture(operator, operatorSignature, userOpHash);
        _validatePaymaster(userOp.sender, operator, userOp.paymasterAndData);
        _validateSession(operator, userOp, proof, session, rlpCalldata, to, value, data);
        // check and update usage
        _checkAndUpdateUsage(operator, userOp, 1);
        validationData = _getValidVerifyData(userOp.sender, operator);
    }

    /**
     * @dev Valdiate the batch normal execute user operation.
     * Requirements:
     * - the userOp must be signed by the operator
     * - the sessions must be in the session merkle tree
     * - the paymaster must be equal to pre-set paymaster
     * - must not execeed the spending limit
     * - the calldata must be in the range of pre-set allowed arguments
     */
    function validateBatchExecute(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) public authorized returns (uint256 validationData) {
        // Decode calldata from userOp.calldata
        (address[] memory to, uint256[] memory value, bytes[] memory data, ) = abi.decode(
            userOp.callData.slice(4, userOp.callData.length - 4),
            (address[], uint256[], bytes[], uint8[])
        );
        // Decode extra data from signature
        (
            bytes32[][] memory proof,
            address operator,
            Session[] memory session,
            bytes[] memory rlpCalldata,
            bytes memory operatorSignature
        ) = abi.decode(
                userOp.signature.slice(20, userOp.signature.length - 20),
                (bytes32[][], address, Session[], bytes[], bytes)
            );
        _validateOperatorSiganture(operator, operatorSignature, userOpHash);

        _validatePaymaster(userOp.sender, operator, userOp.paymasterAndData);
        _validateMultipleSessions(operator, userOp, proof, session, rlpCalldata, to, value, data);
        // check and update usage
        _checkAndUpdateUsage(operator, userOp, session.length);
        validationData = _getValidVerifyData(userOp.sender, operator);
    }

    /**
     * @dev Sets the spending allowance for the operator.
     */
    function setAllowance(
        address operator,
        SpendingAllowanceConfig memory config
    ) public override onlyEnabledValidator {
        super.setAllowance(operator, config);
    }

    /**
     * @dev Sets spending limits for multiple tokens for the operator.
     */
    function batchSetAllowance(
        address operator,
        SpendingAllowanceConfig[] memory config
    ) public override onlyEnabledValidator {
        super.batchSetAllowance(operator, config);
    }

    /**
     * @dev Function for EIP-1271 support, this valdiator does not support it
     */
    function isValidSignature(bytes32, bytes calldata, address) external pure returns (bool) {
        revert("SessionKeyValidator: unsupported");
    }

    /**
     * @dev get operator permission of a wallet
     */
    function getOperatorPermission(
        address wallet,
        address operator
    ) external view returns (OperatorPermission memory permission) {
        permission = _operatorPermission[operator][wallet];
    }

    /**
     * @dev Validate the session.
     * Requirements:
     * - the session must be in the session merkle tree
     * - the session must not execeed the spending limit
     * - the calldata must be in the range of pre-set allowed arguments
     */
    function _validateSession(
        address operator,
        UserOperation memory userOp,
        bytes32[] memory proof,
        Session memory session,
        bytes memory rlpCalldata,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        // if the session is premitted offchain, verify ownerSignature
        bytes32 sessionHash = session.hash();
        _validateSessionRoot(proof, _getSessionRoot(userOp.sender, operator), sessionHash);
        // check spending limit
        _checkAllowance(userOp.sender, operator, to, data, value);
        // check arguments
        _checkArguments(session, to, data, value, rlpCalldata);
        emit SessionUsed(userOp.sender, operator, sessionHash);
    }

    /**
     * @dev Validate the sessions, an execution may use multiple sessions.
     * Requirements:
     * - the sessions must be in the session merkle tree
     * - the executions must not execeed the spending limit
     * - the calldata of each execution must be in the range of pre-set allowed arguments
     */
    function _validateMultipleSessions(
        address operator,
        UserOperation memory userOp,
        bytes32[][] memory proof,
        Session[] memory session,
        bytes[] memory rlpCalldata,
        address[] memory to,
        uint256[] memory value,
        bytes[] memory data
    ) internal {
        require(
            to.length == session.length && session.length == proof.length,
            "SessionKeyValidator: invalid batch length"
        );
        for (uint256 i = 0; i < data.length; i++) {
            _validateSession(operator, userOp, proof[i], session[i], rlpCalldata[i], to[i], value[i], data[i]);
        }
    }

    /**
     * @dev Check if the operator has enough gas and times to use and update usage.
     */
    function _checkAndUpdateUsage(address operator, UserOperation memory userOp, uint256 sessionsToUse) internal {
        (uint128 gasLeft, uint128 timesLeft) = _getRemainingUsage(userOp.sender, operator);
        uint256 gasFee = _computeGasFee(userOp);
        require(gasLeft >= gasFee && timesLeft >= sessionsToUse, "SessionKeyValidator: exceed usage");
        if (gasLeft != type(uint128).max) {
            gasLeft -= uint128(gasFee);
        }
        if (timesLeft != type(uint128).max) {
            timesLeft -= uint128(sessionsToUse);
        }
        _setRemaningUsage(userOp.sender, operator, gasLeft, timesLeft);
    }

    /**
     * @dev Check if the arguments of the executiondata is in the range of pre-set allowed arguments.
     */
    function _checkArguments(
        Session memory session,
        address to,
        bytes memory data,
        uint256 value,
        bytes memory rlpCalldata
    ) internal view {
        // Parse rlpCalldata to abi encoded data, the first 32 bytes is native token value
        bytes memory callDataWithValue = rlpCalldata.rlpToABI();
        // If the target function has arguments, verify rlpCalldata is encoded from function arguments
        if (data.length > 4) {
            require(
                keccak256(data.slice(4, data.length - 4)) ==
                    keccak256(callDataWithValue.slice(32, callDataWithValue.length - 32)),
                "SessionKeyValidator: rlpCalldata is not equally encoded from execution data"
            );
        }
        require(session.to == to, "SessionKeyValidator: invalid to");
        require(session.selector == bytes4(data), "SessionKeyValidator: invalid selector");
        require(
            session.allowedArguments.isAllowedCalldata(rlpCalldata, value),
            "SessionKeyValidator: invalid arguments"
        );
    }

    /**
     * @dev Internal function to set operator permission for a wallet.
     */
    function _setOperatorPermission(address wallet, address operator, OperatorPermission memory permission) internal {
        _operatorPermission[operator][wallet] = permission;
        emit OperatorPermissionSet(wallet, operator, permission);
    }

    /**
     * @dev Internal function to validate operator signature.
     */
    function _validateOperatorSiganture(
        address operator,
        bytes memory operatorSignature,
        bytes32 userOpHash
    ) internal view {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        require(
            SignatureChecker.isValidSignatureNow(operator, hash, operatorSignature),
            "SessionKeyValidator: invalid operator signature"
        );
    }

    /**
     * @dev Internal function to validate paymaster.
     */
    function _validatePaymaster(address wallet, address operator, bytes memory paymasterAndData) internal view {
        address permissionPaymaster = _operatorPermission[operator][wallet].paymaster;
        if (permissionPaymaster != address(0)) {
            require(
                paymasterAndData.length >= 20 && paymasterAndData.slice(0, 20).toAddress(0) == permissionPaymaster,
                "SessionKeyValidator: invalid paymaster"
            );
        }
    }

    /**
     * @dev Internal function to pack validation data.
     */
    function _getValidVerifyData(address wallet, address operator) internal view returns (uint256 validationData) {
        (uint256 validUntil, uint256 validAfter) = _getOperatorPermissionDuration(wallet, operator);
        validationData = _packValidationData(0, validUntil, validAfter);
    }

    /**
     * @dev Internal function to get operator permission valid duration.
     */
    function _getOperatorPermissionDuration(
        address wallet,
        address operator
    ) internal view returns (uint48 validUnitil, uint48 validAfter) {
        validUnitil = _operatorPermission[operator][wallet].validUntil;
        validAfter = _operatorPermission[operator][wallet].validAfter;
    }

    /**
     * @dev Internal function to validate if a session is in the given merkle tree.
     */
    function _validateSessionRoot(bytes32[] memory proof, bytes32 root, bytes32 sessionHash) internal pure {
        require(
            MerkleProof.verify(proof, root, keccak256(bytes.concat(sessionHash))),
            "SessionKeyValidator: invalid session root"
        );
    }

    /**
     * @dev Get session root of a wallet to an operator.
     */
    function getSessionRoot(address wallet, address operator) external view returns (bytes32) {
        return _getSessionRoot(wallet, operator);
    }

    /**
     * @dev Internal function to get session root of a wallet to an operator.
     */
    function _getSessionRoot(address wallet, address operator) internal view returns (bytes32) {
        return _operatorPermission[operator][wallet].sessionRoot;
    }

    /**
     * @dev Set remaining permission usage for an operator.
     */
    function _setRemaningUsage(address wallet, address operator, uint128 gasUsage, uint128 times) internal {
        _operatorPermission[operator][wallet].gasRemaining = uint128(gasUsage);
        _operatorPermission[operator][wallet].timesRemaining = uint128(times);
    }

    /**
     * @dev Internal function to get remaining permission usage for an operator.
     */
    function _getRemainingUsage(
        address wallet,
        address operator
    ) internal view returns (uint128 gasUsage, uint128 times) {
        gasUsage = _operatorPermission[operator][wallet].gasRemaining;
        times = _operatorPermission[operator][wallet].timesRemaining;
    }

    /**
     * Compute the max allowed gas fee of a user operation.
     */
    function _computeGasFee(UserOperation memory userOp) internal pure returns (uint256 fee) {
        uint256 mul = address(bytes20(userOp.paymasterAndData)) != address(0) ? 3 : 1;
        uint256 requiredGas = userOp.callGasLimit + userOp.verificationGasLimit * mul + userOp.preVerificationGas;

        fee = requiredGas * userOp.maxFeePerGas;
    }

    function _getChainId() internal view returns (uint256 id) {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
    }
}
