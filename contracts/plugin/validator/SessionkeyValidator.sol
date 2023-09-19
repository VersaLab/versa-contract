// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "../../common/SelfAuthorized.sol";
import "./BaseValidator.sol";
import "../../common/AllowanceCalldata.sol";
import "../../VersaWallet.sol";
import "../../base/ValidatorManager.sol";

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
    // The paymaster allowed to use
    address paymaster;
    // The timestamp when the session is expired, 0 for infinite
    uint48 validUntil;
    // The timestamp when the session is valid
    uint48 validAfter;
    // The times limit for the session
    uint256 timesLimit;
}

library SessionLib {
    /**
     * @dev Returns the hash of a session.
     */
    function hash(Session memory session) internal pure returns (bytes32 sessionHash) {
        sessionHash = keccak256(
            abi.encode(
                session.to,
                session.selector,
                session.allowedArguments,
                session.paymaster,
                session.validUntil,
                session.validAfter,
                session.timesLimit
            )
        );
    }
}

/**
 * @title SessionKeyValidator
 * @dev Contract that handles validation of user operations using session keys.
 * This contract is inspired by https://github.com/permissivelabs/core
 */
contract SessionKeyValidator is BaseValidator, SelfAuthorized {
    using AllowanceCalldata for bytes;
    using ECDSA for bytes32;
    using SessionLib for Session;
    using BytesLib for bytes;

    /// @dev Emit on an session root set
    event SessionRootSet(address indexed wallet, address indexed operator, bytes32 sessionRoot);
    /// @dev Emit on an operator gas limit set
    event OperatorRemainingGasSet(address indexed wallet, address indexed operator, uint256 gasLimit);
    /// @dev Emit on a session used
    event SessionUsed(address indexed wallet, address indexed operator, bytes32 indexed sessionHash);

    /// @dev The operator permission for each wallet
    mapping(address operator => mapping(address wallet => bytes32)) internal _sessionRoot;

    /// @dev The remaining gas for each operator of wallet
    mapping(address operator => mapping(address wallet => uint256)) internal _remainingGas;

    /// @dev The session usage for each session
    mapping(bytes32 sessionHash => mapping(address wallet => uint256)) internal _sessionUsage;

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @notice This validator is supposed to be enabled during wallet initialization without performing
     * validator initialization. Just let it always return true.
     * @return A boolean indicating if the wallet is initialized.
     */
    function _isWalletInited(address) internal pure override returns (bool) {
        return true;
    }

    /**
     * @dev Sets the operator permission for the wallet.
     */
    function setSessionRoot(address operator, bytes32 sessionRoot) external onlyEnabledValidator {
        _setSessionRoot(msg.sender, operator, sessionRoot);
    }

    function setOperatorRemainingGas(address operator, uint256 remainingGas) external onlyEnabledValidator {
        _setRemainingGas(msg.sender, operator, remainingGas);
    }

    /**
     * @dev Valdiate the signature of the user operation.
     */
    function validateSignature(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) external onlyEnabledValidator returns (uint256 validationData) {
        bytes4 selector = bytes4(userOp.callData.slice(0, 4));
        // Split on normal execute and batch normal execute
        if (selector == VersaWallet.normalExecute.selector) {
            validationData = _validateSingleExecute(userOp, userOpHash);
        } else if (selector == VersaWallet.batchNormalExecute.selector) {
            validationData = _validateBatchExecute(userOp, userOpHash);
        } else {
            revert("SessionKeyValidator: invalid wallet operation");
        }
    }

    /**
     * @dev Valdiate the normal execute user operation.
     * Requirements:
     * - the userOp must be signed by the operator
     * - the session must be valid
     * - the calldata must be in the range of pre-set allowed arguments
     */
    function _validateSingleExecute(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) internal returns (uint256 validationData) {
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
        _validateOperatorGasUsage(operator, userOp);
        address paymaster = _parsePaymaster(userOp.paymasterAndData);
        _validateSession(operator, userOp, proof, session, rlpCalldata, paymaster, to, value, data);
        // check and update usage
        validationData = _packValidationData(
            _validateOperatorSiganture(operator, operatorSignature, userOpHash),
            session.validUntil,
            session.validAfter
        );
    }

    /**
     * @dev Valdiate the batch normal execute user operation.
     * Requirements:
     * - the userOp must be signed by the operator
     * - the sessions must be valid
     * - the calldata must be in the range of pre-set allowed arguments
     */
    function _validateBatchExecute(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) internal returns (uint256 validationData) {
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
        _validateOperatorGasUsage(operator, userOp);
        (uint48 validUntil, uint48 validAfter) = _validateMultipleSessions(
            operator,
            userOp,
            proof,
            session,
            rlpCalldata,
            to,
            value,
            data
        );
        validationData = _packValidationData(
            _validateOperatorSiganture(operator, operatorSignature, userOpHash),
            validUntil,
            validAfter
        );
    }

    /**
     * @dev Function for EIP-1271 support, this valdiator does not support it
     */
    function isValidSignature(bytes32, bytes calldata, address) external pure returns (bool) {
        revert("SessionKeyValidator: unsupported");
    }

    /**
     * @dev get operator sessionRoot of a wallet
     */
    function getSesionRoot(address wallet, address operator) external view returns (bytes32 sessionRoot) {
        sessionRoot = _sessionRoot[operator][wallet];
    }

    function getRemainingGas(address wallet, address operator) external view returns (uint256) {
        return _getRemainingGas(wallet, operator);
    }

    function _getRemainingGas(address wallet, address operator) internal view returns (uint256) {
        return _remainingGas[operator][wallet];
    }

    function _validateOperatorGasUsage(address operator, UserOperation memory userOp) internal {
        uint256 gasFee = _computeGasFee(userOp);
        uint256 remainingGas = _getRemainingGas(userOp.sender, operator);
        require(remainingGas >= gasFee, "SessionKeyValidator: gas fee exceeds remaining gas");
        _setRemainingGas(userOp.sender, operator, remainingGas - gasFee);
    }

    /**
     * @dev Validate the session.
     * Requirements:
     * - the session must be in the session merkle tree
     * - the paymaster must be equal to pre-set paymaster
     * - the session must not exceed the usage limit
     * - the calldata must be in the range of pre-set allowed arguments
     */
    function _validateSession(
        address operator,
        UserOperation memory userOp,
        bytes32[] memory proof,
        Session memory session,
        bytes memory rlpCalldata,
        address paymaster,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        bytes32 sessionHash = session.hash();
        _validateSessionRoot(proof, _getSessionRoot(userOp.sender, operator), sessionHash);
        _validatePaymaster(session.paymaster, paymaster);
        _checkAndUpdateSessionUsage(sessionHash, userOp, session);
        // check calldata arguments
        _checkArguments(session, to, data, value, rlpCalldata);
        emit SessionUsed(userOp.sender, operator, sessionHash);
    }

    /**
     * @dev Validate the sessions, an execution may use multiple sessions.
     * Requirements:
     * - the sessions must be in the session merkle tree
     * - each session must not exceed the usage limit
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
    ) internal returns (uint48 validUntil, uint48 validAfter) {
        require(
            to.length == rlpCalldata.length && rlpCalldata.length == session.length && session.length == proof.length,
            "SessionKeyValidator: invalid batch length"
        );
        address paymaster = _parsePaymaster(userOp.paymasterAndData);
        for (uint256 i = 0; i < data.length; i++) {
            // Get the intersection of all sessions' validation durations
            (validUntil, validAfter) = _getValidationIntersection(
                validUntil,
                session[i].validUntil,
                validAfter,
                session[i].validAfter
            );
            _validateSession(
                operator,
                userOp,
                proof[i],
                session[i],
                rlpCalldata[i],
                paymaster,
                to[i],
                value[i],
                data[i]
            );
        }
    }

    /**
     * @dev Check if the session exceeds the usage limit and update the usage.
     */
    function _checkAndUpdateSessionUsage(
        bytes32 sessionHash,
        UserOperation memory userOp,
        Session memory session
    ) internal {
        uint256 timesUsed = _getSessionUsage(userOp.sender, sessionHash) + 1;
        require(timesUsed <= session.timesLimit, "SessionKeyValidator: exceed usage");
        _setSessionUsage(userOp.sender, sessionHash, timesUsed);
    }

    /**
     * @dev Check if the arguments of the execution data is in the range of pre-set allowed arguments.
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
     * @dev Internal function to set operator session root for a wallet.
     */
    function _setSessionRoot(address wallet, address operator, bytes32 sessionRoot) internal {
        _sessionRoot[operator][wallet] = sessionRoot;
        emit SessionRootSet(wallet, operator, sessionRoot);
    }

    function _setRemainingGas(address wallet, address operator, uint256 remainingGas) internal {
        _remainingGas[operator][wallet] = remainingGas;
        emit OperatorRemainingGasSet(wallet, operator, remainingGas);
    }

    function _setSessionUsage(address wallet, bytes32 sessionHash, uint256 times) internal {
        _sessionUsage[sessionHash][wallet] = times;
    }

    /**
     * @dev Internal function to validate operator signature.
     */
    function _validateOperatorSiganture(
        address operator,
        bytes memory operatorSignature,
        bytes32 userOpHash
    ) internal view returns (uint256) {
        bytes32 hash = keccak256(abi.encode(userOpHash, address(this))).toEthSignedMessageHash();
        if (SignatureChecker.isValidSignatureNow(operator, hash, operatorSignature)) {
            return 0;
        } else {
            return SIG_VALIDATION_FAILED;
        }
    }

    /**
     * @dev Internal function to validate paymaster.
     */
    function _validatePaymaster(address sessionPaymaster, address actualPaymaster) internal pure {
        if (sessionPaymaster != address(0)) {
            require(sessionPaymaster == actualPaymaster, "SessionKeyValidator: invalid paymaster");
        }
    }

    /**
     * @dev Get session root of a wallet to an operator.
     */
    function getSessionRoot(address wallet, address operator) external view returns (bytes32) {
        return _getSessionRoot(wallet, operator);
    }

    /**
     * @dev Get remaining gas of a wallet to an operator.
     */
    function getOperatorRemainingGas(address wallet, address operator) external view returns (uint256) {
        return _remainingGas[operator][wallet];
    }

    /**
     * @dev Get session usage
     */
    function getSessionUsage(address wallet, bytes32 sessionHash) external view returns (uint256 times) {
        return _getSessionUsage(wallet, sessionHash);
    }

    /**
     * @dev Internal function to get session root of a wallet to an operator.
     */
    function _getSessionRoot(address wallet, address operator) internal view returns (bytes32) {
        return _sessionRoot[operator][wallet];
    }

    function _getSessionUsage(address wallet, bytes32 sessionHash) internal view returns (uint256 times) {
        return _sessionUsage[sessionHash][wallet];
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

    function _parsePaymaster(bytes memory paymasterAndData) internal pure returns (address paymaster) {
        if (paymasterAndData.length >= 20) {
            paymaster = paymasterAndData.slice(0, 20).toAddress(0);
        }
    }

    /**
     * @dev Compute the max allowed gas fee for an user operation.
     */
    function _computeGasFee(UserOperation memory userOp) internal pure returns (uint256 fee) {
        uint256 mul = address(bytes20(userOp.paymasterAndData)) != address(0) ? 3 : 1;
        uint256 requiredGas = userOp.callGasLimit + userOp.verificationGasLimit * mul + userOp.preVerificationGas;
        fee = requiredGas * userOp.maxFeePerGas;
    }

    /// @dev Get the intersection of given validation durations.
    function _getValidationIntersection(
        uint48 validUntil1,
        uint48 validUntil2,
        uint48 validAfter1,
        uint48 validAfter2
    ) internal pure returns (uint48 validUntil, uint48 validAfter) {
        if (validUntil1 != 0 && validUntil2 != 0) {
            validUntil = validUntil1 < validUntil2 ? validUntil1 : validUntil2;
        } else {
            validUntil = validUntil1 > validUntil2 ? validUntil1 : validUntil2;
        }
        validAfter = validAfter1 > validAfter2 ? validAfter1 : validAfter2;
        if (validUntil > 0) {
            require(validUntil >= validAfter, "SessionKeyValidator: invalid validation duration");
        }
    }
}
