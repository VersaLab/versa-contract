// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "./TokenCallbackHandler.sol";
import "../interface/IERC1271.sol";
import "../interface/IValidator.sol";
import "../base/ValidatorManager.sol";
import "../VersaWallet.sol";

/**
 * @title CompatibilityFallbackHandler
 * @notice A contract that handles compatibility fallback operations for token callbacks.
 */
contract CompatibilityFallbackHandler is TokenCallbackHandler, IERC1271 {
    string private constant VERSA_NAME = "VersaWallet";

    bytes32 private constant VERSA_MSG_TYPEHASH = keccak256("VersaWalletMessage(bytes message)");

    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /**
     * @notice Validates the provided signature for a given hash,
     * this function is not gas optimized and is not supposed to be called on chain.
     * @param _hash The hash of the data to be signed.
     * @param _signature The signature byte array associated with the hash.
     * @return magicValue The bytes4 magic value of ERC1721.
     */
    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view override returns (bytes4 magicValue) {
        address wallet = msg.sender;
        address validator = address(bytes20(_signature[0:20]));
        require(
            ValidatorManager(wallet).getValidatorType(validator) == ValidatorManager.ValidatorType.Sudo,
            "Only sudo validator"
        );
        // Get encoded message hash for versa wallet
        // Include the chainid and wallet address in the signed message
        bytes32 signedMessageHash = getMessageDataHashForVersa(wallet, _hash);

        bool isValid = IValidator(validator).isValidSignature(signedMessageHash, _signature[20:], wallet);
        return isValid ? EIP1271_MAGIC_VALUE : bytes4(0xffffffff);
    }

    /**
     * @dev Returns the hash of a message that can be signed by versa signers.
     * @param wallet The versa wallet address.
     * @param hash Raw message hash that was signed
     * @return bytes32 Hash of the encoded message.
     */
    function getMessageDataHashForVersa(address wallet, bytes32 hash) public view returns (bytes32) {
        bytes32 versaMessageHash = keccak256(abi.encode(VERSA_MSG_TYPEHASH, hash));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), versaDomainSeparator(wallet), versaMessageHash));
    }

    /**
     * @dev Returns the domain separator for this wallet.
     * @param wallet The versa wallet address.
     * @return bytes32 The domain separator hash.
     */
    function versaDomainSeparator(address wallet) public view returns (bytes32) {
        string memory name = VERSA_NAME;
        string memory version = VersaWallet(payable(wallet)).VERSA_VERSION();

        return
            keccak256(
                abi.encode(
                    DOMAIN_SEPARATOR_TYPEHASH,
                    keccak256(bytes(name)),
                    keccak256(bytes(version)),
                    block.chainid,
                    wallet
                )
            );
    }
}
