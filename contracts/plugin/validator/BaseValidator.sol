// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "../../interface/IValidator.sol";
import "../../VersaWallet.sol";

/**
 * @title BaseValidator
 * @dev Base contract for validator implementation.
 */
abstract contract BaseValidator is IValidator {
    event WalletInited(address indexed wallet);
    event WalletCleared(address indexed wallet);

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    mapping(address => bool) _walletInited;

    /**
     * @dev Modifier to check if the validator is enabled for the caller wallet.
     */
    modifier onlyEnabledValidator {
        require(
            VersaWallet(payable(msg.sender)).isValidatorEnabled(address(this)),
            "Validator is not enabled"
        );
        _;
    }

    /**
     * @dev Initializes the wallet configuration.
     * @param data The initialization data.
     */
    function initWalletConfig(bytes memory data)
        external
        onlyEnabledValidator
    {
        if(!_walletInited[msg.sender]) {
            _walletInited[msg.sender] = true;
            _init(data);
            emit WalletInited(msg.sender);
        }
    }

    /**
     * @dev Clears the wallet configuration. Triggered when disabled by a wallet
     */
    function clearWalletConfig() external onlyEnabledValidator {
        if (_walletInited[msg.sender]) {
            _walletInited[msg.sender] = false;
            _clear();
            emit WalletCleared(msg.sender);
        }
    }

    /**
     * @dev Internal function to handle wallet initialization.
     * Subclass must implement this function
     * @param data The initialization data.
     */
    function _init(bytes memory data) internal virtual {}

    /**
     * @dev Internal function to handle wallet configuration clearing.
     * Subclass must implement this function
     */
    function _clear() internal virtual {}

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @param wallet The wallet address to check.
     * @return A boolean indicating if the wallet is initialized.
     */
    function isWalletInited(address wallet) external view returns(bool) {
        return _walletInited[wallet];
    }

    /**
     * @dev Inherits from ERC165.
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IValidator).interfaceId;
    }

    /**
     * @dev Check the decoded signature type and fee.
     * @param sigType The signature type.
     * @param maxFeePerGas The maximum fee per gas.
     * @param maxPriorityFeePerGas The maximum priority fee per gas.
     * @param actualMaxFeePerGas The actual maximum fee per gas from the user operation.
     * @param actualMaxPriorityFeePerGas The actual maximum priority fee per gas from the user operation.
     * @return A boolean indicating whether the decoded signature is valid or not.
     */
    function _checkTransactionTypeAndFee(
        uint256 sigType,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 actualMaxFeePerGas,
        uint256 actualMaxPriorityFeePerGas
    ) pure internal returns(bool) {
        if (sigType != 0x00 && sigType != 0x01) {
            return false;
        }
        if (sigType == 0x01
            && (actualMaxFeePerGas >= maxFeePerGas || actualMaxPriorityFeePerGas >= maxPriorityFeePerGas)) {
            return false;
        }
        return true;
    }

    /**
     * @dev Pack the validation data.
     * @param sigFailed The signature validation result.
     * @param validUntil The valid until timestamp.
     * @param validAfter The valid after timestamp.
     * @return The packed validation data.
     */
    function _packValidationData(uint256 sigFailed, uint256 validUntil, uint256 validAfter) internal pure returns (uint256) {
        return sigFailed | validUntil << 160 | validAfter << (160 + 48);
    }
}
