// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./BaseValidator.sol";
import "../../library/AddressLinkedList.sol";
import "../../library/SignatureHandler.sol";

/**
 * @title MultiSigValidator.
 * A multi-ECDSA validator contract.
 */
contract MultiSigValidator is BaseValidator {
    using ECDSA for bytes32;

    event ResetGuardians(address indexed wallet, uint256 threshold, address[] indexed guardians);
    event AddGuardian(address indexed wallet, address indexed guardian);
    event RevokeGuardian(address indexed wallet, address indexed guardian);
    event ChangeThreshold(address indexed wallet, uint256 threshold);

    event ApproveHash(bytes32 hash);
    event RevokeHash(bytes32 hash);

    struct WalletInfo {
        // guardians count of a wallet
        uint128 guardianCount;
        // verification threshold
        uint128 threshold;
    }

    /// @dev Record guardians of a wallet
    mapping(address guardian => mapping(address wallet => bool)) internal _guardians;

    /// @dev Record signer's count and verification threshold of a wallet
    mapping(address => WalletInfo) internal _walletInfo;

    /// @dev Record approved signed message hashes of a wallet
    mapping(bytes32 messageHash => mapping(address wallet => bool)) internal _approvedHashes;

    /**
     * @dev Internal function to handle wallet initialization.
     * @param data The initialization data.
     */
    function _init(bytes memory data) internal override {
        (address[] memory guardians, uint256 newThreshold) = abi.decode(data, (address[], uint256));
        require(guardians.length > 0 && newThreshold <= guardians.length, "Invalid initdata");
        for (uint256 i = 0; i < guardians.length; i++) {
            _addGuardian(msg.sender, guardians[i]);
        }
        _changeThreshold(msg.sender, newThreshold);
    }

    /**
     * @dev Internal function to handle wallet configuration clearing.
     * We don't delete guardian config in this validator
     */
    function _clear() internal override {}

    /**
     * @notice Let the sudo validator add a guardian for its wallet.
     * @param guardian The guardian to add.
     * @param newThreshold The new threshold that will be set after addition.
     */
    function addGuardian(address guardian, uint256 newThreshold) external onlyEnabledValidator {
        _addGuardian(msg.sender, guardian);
        _changeThreshold(msg.sender, newThreshold);
    }

    /**
     * @notice Let the sudo validator add guardians for its wallet.
     * @param guardians The guardian list to add.
     * @param newThreshold The new threshold that will be set after addition.
     */
    function addGuardians(address[] calldata guardians, uint256 newThreshold) external onlyEnabledValidator {
        uint guardiansLength = guardians.length;
        for (uint i = 0; i < guardiansLength; i++) {
            _addGuardian(msg.sender, guardians[i]);
        }
        _changeThreshold(msg.sender, newThreshold);
    }

    /**
     * @notice Let the sudo validator revoke a guardian from its wallet.
     * @param guardian The guardian to revoke.
     * @param newThreshold The new threshold that will be set after execution of revokation.
     */
    function revokeGuardian(address guardian, uint256 newThreshold) external onlyEnabledValidator {
        require(_guardiansCount(msg.sender) >= 2, "Must have at least one guardian");
        _revokeGuardian(msg.sender, guardian);
        _changeThreshold(msg.sender, newThreshold);
    }

    /**
     * @notice Let the sudo validator change the guardian threshold required.
     * @param newThreshold The new threshold that will be set after execution of revokation.
     */
    function changeThreshold(uint256 newThreshold) external onlyEnabledValidator {
        _changeThreshold(msg.sender, newThreshold);
    }

    /**
     * @notice Clear previous guardians and set new guardians and threshold.
     * @param newThreshold The new threshold that will be set after execution of revokation.
     * @param newGuardians The array of new guardians, must be ordered for duplication check.
     */
    function resetGuardians(
        uint256 newThreshold,
        address[] calldata oldGuardians,
        address[] calldata newGuardians
    ) external onlyEnabledValidator {
        // Make sure the wallet has at least one guardian
        require(
            _guardiansCount(msg.sender) + newGuardians.length > oldGuardians.length,
            "Must have at least one guardian"
        );
        for (uint256 i = 0; i < oldGuardians.length; i++) {
            _revokeGuardian(msg.sender, oldGuardians[i]);
        }
        for (uint256 i = 0; i < newGuardians.length; i++) {
            _addGuardian(msg.sender, newGuardians[i]);
        }
        _changeThreshold(msg.sender, newThreshold);
        emit ResetGuardians(msg.sender, newThreshold, newGuardians);
    }

    /**
     * @dev Function to approve a message hash for EIP-1271 validation.
     * @param hash The hash to be approved.
     */
    function approveHash(bytes32 hash) external onlyEnabledValidator {
        require(!_isHashApproved(msg.sender, hash), "Hash already approved");
        _approvedHashes[hash][msg.sender] = true;
        emit ApproveHash(hash);
    }

    /**
     * @dev Function to revoke an previously approved message hash.
     * @param hash The hash to be revoked.
     */
    function revokeHash(bytes32 hash) external onlyEnabledValidator {
        require(_isHashApproved(msg.sender, hash), "Hash is not approved");
        _approvedHashes[hash][msg.sender] = false;
        emit RevokeHash(hash);
    }

    /**
     * @dev Internal function to add a guardian for a wallet.
     * @param wallet The target wallet.
     * @param guardian The guardian to add.
     */
    function _addGuardian(address wallet, address guardian) internal {
        require(!_isGuardian(wallet, guardian), "Guardian is already added");
        require(guardian != wallet && guardian != address(0), "Invalid guardian address");
        WalletInfo storage info = _walletInfo[wallet];
        info.guardianCount++;
        _guardians[guardian][msg.sender] = true;
        emit AddGuardian(wallet, guardian);
    }

    /**
     * @dev Lets an authorised module revoke a guardian from a wallet.
     * @param wallet The target wallet.
     * @param guardian The guardian to revoke.
     */
    function _revokeGuardian(address wallet, address guardian) internal {
        require(_isGuardian(wallet, guardian), "Not a valid guardian");
        WalletInfo storage info = _walletInfo[wallet];
        _guardians[guardian][msg.sender] = false;
        info.guardianCount--;
        emit RevokeGuardian(wallet, guardian);
    }

    /**
     * @dev Allows to update the number of required confirmations by guardians.
     * @param wallet The target wallet.
     * @param newThreshold New threshold.
     */
    function _changeThreshold(address wallet, uint256 newThreshold) internal {
        WalletInfo storage info = _walletInfo[wallet];
        // Validate that threshold is smaller than or equal to number of guardians.
        if (info.guardianCount == 0) {
            require(newThreshold == 0, "Threshold must be 0");
        } else {
            require(newThreshold > 0, "Threshold cannot be 0");
        }
        require(newThreshold <= info.guardianCount, "Threshold must be lower or equal to guardians count");
        info.threshold = uint128(newThreshold);
        emit ChangeThreshold(wallet, newThreshold);
    }

    /**
     * @dev Inherits from IValidator.
     * @param userOp The userOp to validate.
     * @param userOpHash The hash of the userOp.
     */
    function validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) external view returns (uint256 validationData) {
        uint256 currentThreshold = _threshold(userOp.sender);
        // Check that the provided signature data is not too short
        // 20 bytes validator address + 1 byte sig type + required signatures(no less than threshold * 65)
        if (currentThreshold == 0 || userOp.signature.length < 20 + 1 + currentThreshold * 65) {
            return SIG_VALIDATION_FAILED;
        }
        SignatureHandler.SplitedSignature memory splitedSig = SignatureHandler.splitUserOpSignature(userOp, userOpHash);
        if (
            !_checkTransactionTypeAndFee(
                splitedSig.signatureType,
                splitedSig.maxFeePerGas,
                splitedSig.maxPriorityFeePerGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas
            )
        ) {
            return SIG_VALIDATION_FAILED;
        }

        bytes32 ethSignedMessageHash = splitedSig.hash.toEthSignedMessageHash();
        // Check if signatures are valid, return `SIG_VALIDATION_FAILED` if error occurs
        try this.checkNSignatures(userOp.sender, ethSignedMessageHash, splitedSig.signature, currentThreshold) {
            return _packValidationData(0, splitedSig.validUntil, splitedSig.validAfter);
        } catch {
            return SIG_VALIDATION_FAILED;
        }
    }

    /**
     * @notice Legacy EIP-1271 signature validation method.
     * @param hash Hash of data signed.
     * @param signature Signature byte array associated with _data.
     * @return True if signature valid.
     */
    function isValidSignature(bytes32 hash, bytes calldata signature, address wallet) external view returns (bool) {
        // If signature is empty, the hash must be previously approved
        if (signature.length == 0) {
            require(_isHashApproved(wallet, hash), "Hash not approved");
            // If check if enough valid guardians's signature collected
        } else {
            bytes32 ethSignedMessageHash = hash.toEthSignedMessageHash();
            checkNSignatures(wallet, ethSignedMessageHash, signature, _threshold(wallet));
        }
        return true;
    }

    /**
     * @dev Checks if an account is a guardian for a wallet.
     * @param wallet The target wallet.
     * @param guardian The account.
     * @return true if the account is a guardian for a wallet.
     */
    function isGuardian(address wallet, address guardian) public view returns (bool) {
        return _isGuardian(wallet, guardian);
    }

    /**
     * @dev Returns the number of guardians for a wallet.
     * @param wallet The target wallet.
     * @return the number of guardians.
     */
    function guardiansCount(address wallet) public view returns (uint256) {
        return _guardiansCount(wallet);
    }

    /**
     * @dev Retrieves the wallet threshold count.
     * @param wallet The target wallet.
     * @return uint256 Threshold count.
     */
    function threshold(address wallet) public view returns (uint256) {
        return _threshold(wallet);
    }

    /**
     * @dev Function that check if a hash is approved by given wallet.
     * @param wallet The target wallet.
     * @return bool True if the hash is approves.
     */
    function isHashApproved(address wallet, bytes32 hash) public view returns (bool) {
        return _isHashApproved(wallet, hash);
    }

    /**
     * @notice Checks whether the signature provided is valid for the provided data and hash. Reverts otherwise.
     * @dev Since the EIP-1271 does an external call, be mindful of reentrancy attacks.
     * @param dataHash Hash of the data (could be either a message hash or transaction hash)
     * @param signatures Signature data that should be verified.
     *                   Can be packed ECDSA signature ({bytes32 r}{bytes32 s}{uint8 v}), contract signature (EIP-1271) or approved hash.
     * @param requiredSignatures Amount of required valid signatures.
     */
    function checkNSignatures(
        address wallet,
        bytes32 dataHash,
        bytes memory signatures,
        uint256 requiredSignatures
    ) public view {
        // Check that the provided signature data is not too short
        require(signatures.length >= requiredSignatures * 65, "Signatures data too short");
        // There cannot be an guardian with address 0.
        address lastGuardian = address(0);
        address currentGuardian;
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 i;

        for (i = 0; i < requiredSignatures; i++) {
            (v, r, s) = SignatureHandler.multiSignatureSplit(signatures, i);
            if (v == 0) {
                // If v is 0 then it is a contract signature
                // When handling contract signatures the address of the contract is encoded into r
                currentGuardian = address(uint160(uint256(r)));

                // Check that signature data pointer (s) is not pointing inside the static part of the signatures bytes
                // This check is not completely accurate, since it is possible that more signatures than the threshold are send.
                // Here we only check that the pointer is not pointing inside the part that is being processed
                require(uint256(s) >= requiredSignatures * 65, "Inside static part");

                // Check that signature data pointer (s) is in bounds (points to the length of data -> 32 bytes)
                require(uint256(s) + (32) <= signatures.length, "Contract signatures out of bounds");

                // Check if the contract signature is in bounds: start of data is s + 32 and end is start + signature length
                uint256 contractSignatureLen;
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    contractSignatureLen := mload(add(add(signatures, s), 0x20))
                }
                require(uint256(s) + 32 + contractSignatureLen <= signatures.length, "Contract signature wrong offset");

                // Check signature
                bytes memory contractSignature;
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    // The signature data for contract signatures is appended to the concatenated signatures and the offset is stored in s
                    contractSignature := add(add(signatures, s), 0x20)
                }
                require(
                    SignatureChecker.isValidERC1271SignatureNow(currentGuardian, dataHash, contractSignature),
                    "Contract signature invalid"
                );
            } else {
                // eip712 recovery
                currentGuardian = ECDSA.recover(dataHash, v, r, s);
            }
            require(currentGuardian > lastGuardian && isGuardian(wallet, currentGuardian), "Invalid guardian");
            lastGuardian = currentGuardian;
        }
    }

    /**
     * @dev Internal function that checks if an account is a guardian for a wallet.
     * @param wallet The target wallet.
     * @param guardian The account.
     * @return true if the account is a guardian for a wallet.
     */
    function _isGuardian(address wallet, address guardian) internal view returns (bool) {
        return _guardians[guardian][wallet];
    }

    /**
     * @dev Internal function that returns the number of guardians for a wallet.
     * @param wallet The target wallet.
     * @return the number of guardians.
     */
    function _guardiansCount(address wallet) internal view returns (uint256) {
        return _walletInfo[wallet].guardianCount;
    }

    /**
     * @dev Internal function that retrieves the wallet threshold count.
     * @param wallet The target wallet.
     * @return uint256 Threshold count.
     */
    function _threshold(address wallet) internal view returns (uint256) {
        return _walletInfo[wallet].threshold;
    }

    /**
     * @dev Internal function that check if a hash is approved by given wallet.
     * @param wallet The target wallet.
     * @return bool True if the hash is approves.
     */
    function _isHashApproved(address wallet, bytes32 hash) internal view returns (bool) {
        return _approvedHashes[hash][wallet];
    }
}
