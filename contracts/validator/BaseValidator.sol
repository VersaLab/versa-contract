// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "../interfaces/IValidator.sol";
import "../VersaWallet.sol";

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
     * @dev Modifier to check if the wallet has already been initialized.
     */
    modifier initializer {
        require(!_walletInited[msg.sender], "Has already inited");
        _;
    }

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
        initializer
        onlyEnabledValidator
    {
        _init(data);
        emit WalletInited(msg.sender);
    }

    /**
     * @dev Clears the wallet configuration. Triggered when disabled by a wallet
     */
    function clearWalletConfig() external onlyEnabledValidator {
        _clear();
        emit WalletCleared(msg.sender);
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
}
