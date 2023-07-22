// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "../../../common/SelfAuthorized.sol";
import "./OperatorSpendingLimit.sol";
import "../BaseValidator.sol";
import "../../../common/AllowanceCalldata.sol";
import "../../../VersaWallet.sol";
import "../../../base/ValidatorManager.sol";

struct Session {
    address to;
    bytes4 selector;
    bytes allowedArguments;
}

struct OperatorPermission {
    bytes32 sessionRoot;
    address paymaster;
    uint48 validUntil;
    uint48 validAfter;
    uint128 gasRemaining;
    uint128 timesRemaining;
}

library SessionLib {
    function hash(Session memory session) internal pure returns (bytes32 sessionHash) {
        sessionHash = keccak256(abi.encode(session.to, session.selector, session.allowedArguments));
    }

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

contract SessionKeyValidator is BaseValidator, OperatorSpendingLimit, SelfAuthorized {
    using AllowanceCalldata for bytes;
    using ECDSA for bytes32;
    using SessionLib for Session;
    using SessionLib for OperatorPermission;
    using BytesLib for bytes;

    event OperatorPermissionSet(address indexed wallet, address indexed operator, OperatorPermission permission);
    event SessionUsed(address indexed wallet, address indexed operator, bytes32 indexed sessionHash);

    // operator permission: operator => wallet => permission
    mapping(address => mapping(address => OperatorPermission)) internal _operatorPermission;

    // permission nonce: wallet => nonce
    mapping(address => uint256) internal _permissionNonce;

    // used or revoked siganture hash
    // signatureHash => wallet => isInvalid
    mapping(bytes32 => mapping(address => bool)) internal _revokedSignature;

    /**
     * @dev Internal function to handle wallet initialization.
     * Subclass must implement this function
     * @param data The initialization data.
     */
    function _init(bytes memory data) internal override {}

    /**
     * @dev Internal function to handle wallet configuration clearing.
     * Subclass must implement this function
     */
    function _clear() internal override {}

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @return A boolean indicating if the wallet is initialized.
     */
    function _isWalletInited(address) internal pure override returns (bool) {
        return true;
    }

    function setOperatorPermission(
        address operator,
        OperatorPermission memory permission
    ) external onlyEnabledValidator {
        _setOperatorPermission(msg.sender, operator, permission);
    }

    function revokeSignature(bytes32 signatureHash, address wallet) external onlyEnabledValidator {
        _revokeSignature(wallet, signatureHash);
    }

    function validateSignature(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) external returns (uint256 validationData) {
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

    function validateSingleExecute(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) public returns (uint256 validationData) {
        (
            address to,
            uint256 value,
            bytes memory data, // unused `Operation`

        ) = abi.decode(userOp.callData.slice(4, userOp.callData.length - 4), (address, uint256, bytes, uint8));
        (
            bytes32[] memory proof,
            address operator,
            Session memory session,
            bytes memory rlpCalldata,
            bytes memory operatorSignature,
            bytes memory offchainPermitSignature,
            OperatorPermission memory permission, // only needed for offchain permit
            SpendingLimitSetConfig[] memory configs // only needed for offchain permit
        ) = abi.decode(
                userOp.signature.slice(20, userOp.signature.length - 20),
                (bytes32[], address, Session, bytes, bytes, bytes, OperatorPermission, SpendingLimitSetConfig[])
            );
        _validateSignature(
            offchainPermitSignature,
            operatorSignature,
            userOp.sender,
            operator,
            userOpHash,
            permission,
            configs
        );
        _validatePaymaster(userOp.sender, operator, userOp.paymasterAndData);
        _validateSession(operator, userOp, proof, session, rlpCalldata, to, value, data);
        validationData = _getValidationData(userOp.sender, operator);
    }

    function validateBatchExecute(
        UserOperation memory userOp,
        bytes32 userOpHash
    ) public authorized returns (uint256 validationData) {
        (
            address[] memory to,
            uint256[] memory value,
            bytes[] memory data, // unused `Operation`

        ) = abi.decode(userOp.callData.slice(4, userOp.callData.length - 4), (address[], uint256[], bytes[], uint8[]));
        (
            bytes32[][] memory proof,
            address operator,
            Session[] memory session,
            bytes memory rlpCalldata,
            bytes memory operatorSignature,
            bytes memory offchainPermitSignature,
            OperatorPermission memory permission, // only needed for offchain permit
            SpendingLimitSetConfig[] memory configs // only needed for offchain permit
        ) = abi.decode(
                userOp.signature.slice(20, userOp.signature.length - 20),
                (bytes32[][], address, Session[], bytes, bytes, bytes, OperatorPermission, SpendingLimitSetConfig[])
            );
        _validateSignature(
            offchainPermitSignature,
            operatorSignature,
            userOp.sender,
            operator,
            userOpHash,
            permission,
            configs
        );
        _validatePaymaster(userOp.sender, operator, userOp.paymasterAndData);
        _validateMultipleSessions(operator, userOp, proof, session, rlpCalldata, to, value, data);
        validationData = _getValidationData(userOp.sender, operator);
    }

    /**
     * @dev Sets the spending limit for the caller based on the provided SpendingLimitSetConfig.
     * @param config The SpendingLimitSetConfig to set the spending limit.
     */
    function setSpendingLimit(
        address operator,
        SpendingLimitSetConfig memory config
    ) public override onlyEnabledValidator {
        super.setSpendingLimit(operator, config);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided SpendingLimitSetConfig array.
     * @param configs An array of SpendingLimitSetConfig objects.
     */
    function batchSetSpendingLimit(
        address operator,
        SpendingLimitSetConfig[] memory configs
    ) public override onlyEnabledValidator {
        super.batchSetSpendingLimit(operator, configs);
    }

    function isValidSignature(bytes32, bytes calldata, address) external pure returns (bool) {
        revert("SessionKeyValidator: unsupported");
    }

    function getOperatorPermission(
        address wallet,
        address operator
    ) external view returns (OperatorPermission memory permission) {
        permission = _operatorPermission[operator][wallet];
    }

    function getPermitMessessageHash(
        address wallet,
        address operator,
        bytes32 permissionHash,
        bytes32 spendingLimitConfigHash
    ) external view returns (bytes32) {
        return _getPermitMessageHash(wallet, operator, permissionHash, spendingLimitConfigHash);
    }

    function getPermitNonce(address wallet) external view returns (uint256) {
        return _getPermitNonce(wallet);
    }

    function validateSessionRoot(
        bytes32[] memory proof,
        bytes32 sessionRoot,
        Session memory session
    ) external pure returns (bool) {
        _validateSessionRoot(proof, sessionRoot, session.hash());
        return true;
    }

    function validateOffchainPermit(
        address wallet,
        address operator,
        bytes32 permissionHash,
        bytes32 spendingLimitConfigHash,
        bytes memory ownerSignature
    ) external view returns (bool) {
        bytes32 signatureHash = keccak256(ownerSignature);
        require(!_isRevokedSignature(wallet, signatureHash), "SessionKeyValidator: signature has been revoked");
        address validator = ownerSignature.slice(0, 20).toAddress(0);
        require(
            VersaWallet(payable(wallet)).getValidatorType(validator) == ValidatorManager.ValidatorType.Sudo,
            "SessionKeyValidator: invalid validator"
        );
        bytes32 messageHash = _getPermitMessageHash(wallet, operator, permissionHash, spendingLimitConfigHash);
        require(
            IValidator(validator).isValidSignature(
                messageHash,
                ownerSignature.slice(20, ownerSignature.length - 20),
                wallet
            ),
            "SessionKeyValidator: invalid offchain signature"
        );
        return true;
    }

    function _validateOffchainPermit(
        address wallet,
        address operator,
        bytes32 permissionHash,
        bytes32 spendingLimitConfigHash,
        bytes memory ownerSignature
    ) internal {
        bytes32 signatureHash = keccak256(ownerSignature);
        require(!_isRevokedSignature(wallet, signatureHash), "SessionKeyValidator: signature has been revoked");
        address validator = ownerSignature.slice(0, 20).toAddress(0);
        require(
            VersaWallet(payable(wallet)).getValidatorType(validator) == ValidatorManager.ValidatorType.Sudo,
            "SessionKeyValidator: invalid validator"
        );
        bytes32 messageHash = _getPermitMessageHash(wallet, operator, permissionHash, spendingLimitConfigHash);
        require(
            IValidator(validator).isValidSignature(
                messageHash,
                ownerSignature.slice(20, ownerSignature.length - 20),
                wallet
            ),
            "SessionKeyValidator: invalid offchain signature"
        );
        _incrementPermissionNonce(wallet);
    }

    function _validateSignature(
        bytes memory ownerSignature,
        bytes memory operatorSignature,
        address wallet,
        address operator,
        bytes32 userOpHash,
        OperatorPermission memory permission,
        SpendingLimitSetConfig[] memory configs
    ) internal {
        if (ownerSignature.length > 0) {
            bytes32 spendingLimitConfigHash = keccak256(abi.encode(configs));
            _validateOffchainPermit(wallet, operator, permission.hash(), spendingLimitConfigHash, ownerSignature);
            _setOperatorPermission(wallet, operator, permission);
            _batchSetSpendingLimit(wallet, operator, configs);
        }
        // verify operatorSignature
        // operator of different session must be the same
        _validateOperatorSiganture(operator, operatorSignature, userOpHash);
    }

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
        // check and update usage
        _checkAndUpdateUsage(operator, userOp);
        // check spending limit
        _checkSpendingLimit(userOp.sender, operator, to, data, value);
        // check arguments
        _checkArguments(session, to, data, rlpCalldata);
        emit SessionUsed(userOp.sender, operator, sessionHash);
    }

    function _validateMultipleSessions(
        address operator,
        UserOperation memory userOp,
        bytes32[][] memory proof,
        Session[] memory session,
        bytes memory rlpCalldata,
        address[] memory to,
        uint256[] memory value,
        bytes[] memory data
    ) internal {
        require(
            to.length == session.length && session.length == proof.length,
            "SessionKeyValidator: invalid batch length"
        );
        for (uint256 i = 0; i < data.length; i++) {
            _validateSession(operator, userOp, proof[i], session[i], rlpCalldata, to[i], value[i], data[i]);
        }
    }

    function _checkAndUpdateUsage(address operator, UserOperation memory userOp) internal {
        (uint256 gasLeft, uint256 timesLeft) = _getRemainingUsage(userOp.sender, operator);
        uint256 gasFee = _computeGasFee(userOp);
        require(gasLeft > gasFee && timesLeft > 0, "SessionKeyValidator: exceed usage");
        if (gasLeft != type(uint128).max) {
            gasLeft -= gasFee;
        }
        if (timesLeft != type(uint128).max) {
            timesLeft -= 1;
        }
        _setRemaningUsage(userOp.sender, operator, gasLeft, timesLeft);
    }

    function _checkArguments(
        Session memory session,
        address to,
        bytes memory data,
        bytes memory rlpCalldata
    ) internal view {
        // verify rlpCalldata is encoded from _userOp.calldata
        require(
            keccak256(data.slice(4, data.length - 4)) == keccak256(rlpCalldata.rlpToABI()),
            "SessionKeyValidator: invalid calldata"
        );
        require(session.to == to, "SessionKeyValidator: invalid to");
        require(session.selector == bytes4(data), "SessionKeyValidator: invalid selector");
        require(rlpCalldata.isAllowedCalldata(session.allowedArguments), "SessionKeyValidator: invalid arguments");
    }

    function _revokeSignature(address wallet, bytes32 signatureHash) internal {
        _revokedSignature[signatureHash][wallet] = true;
    }

    function _setOperatorPermission(address wallet, address operator, OperatorPermission memory permission) internal {
        _operatorPermission[operator][wallet] = permission;
        emit OperatorPermissionSet(wallet, operator, permission);
    }

    function _incrementPermissionNonce(address wallet) internal {
        _permissionNonce[wallet] += 1;
    }

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

    function _validatePaymaster(address wallet, address operator, bytes memory paymasterAndData) internal view {
        address permissionPaymaster = _operatorPermission[operator][wallet].paymaster;
        if (permissionPaymaster != address(0)) {
            require(
                paymasterAndData.length >= 20 && paymasterAndData.slice(0, 20).toAddress(0) == permissionPaymaster,
                "SessionKeyValidator: invalid paymaster"
            );
        }
    }

    function _getValidationData(address wallet, address operator) internal view returns (uint256 validationData) {
        (uint256 validUntil, uint256 validAfter) = _getOperatorPermissionDuration(wallet, operator);
        validationData = _packValidationData(0, validUntil, validAfter);
    }

    function _getOperatorPermissionDuration(
        address wallet,
        address operator
    ) internal view returns (uint48 validUnitil, uint48 validAfter) {
        // compare gas cost
        validUnitil = _operatorPermission[operator][wallet].validUntil;
        validAfter = _operatorPermission[operator][wallet].validAfter;
    }

    function _getPermitNonce(address wallet) internal view returns (uint256) {
        return _permissionNonce[wallet];
    }

    function _getPermitMessageHash(
        address wallet,
        address operator,
        bytes32 permissionHash,
        bytes32 spendingLimitConfigHash
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    wallet,
                    operator,
                    permissionHash,
                    spendingLimitConfigHash,
                    _getChainId(),
                    _getPermitNonce(wallet)
                )
            );
    }

    function _validateSessionRoot(bytes32[] memory proof, bytes32 root, bytes32 sessionHash) internal pure {
        require(
            MerkleProof.verify(proof, root, keccak256(bytes.concat(sessionHash))),
            "SessionKeyValidator: invalid session root"
        );
    }

    function getSessionRoot(address wallet, address operator) external view returns (bytes32) {
        return _getSessionRoot(wallet, operator);
    }

    function _getSessionRoot(address wallet, address operator) internal view returns (bytes32) {
        return _operatorPermission[operator][wallet].sessionRoot;
    }

    function _setRemaningUsage(address wallet, address operator, uint256 gasUsage, uint256 times) internal {
        require(times | gasUsage <= type(uint128).max, "SessionKeyValidator: invalid usage");
        _operatorPermission[operator][wallet].gasRemaining = uint128(gasUsage);
        _operatorPermission[operator][wallet].timesRemaining = uint128(times);
    }

    function _isRevokedSignature(address wallet, bytes32 signatureHash) internal view returns (bool) {
        return _revokedSignature[signatureHash][wallet];
    }

    function isRevokedSignature(address wallet, bytes32 signatureHash) external view returns (bool) {
        return _isRevokedSignature(wallet, signatureHash);
    }

    function _getRemainingUsage(
        address wallet,
        address operator
    ) internal view returns (uint256 gasUsage, uint256 times) {
        gasUsage = _operatorPermission[operator][wallet].gasRemaining;
        times = _operatorPermission[operator][wallet].timesRemaining;
    }

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
