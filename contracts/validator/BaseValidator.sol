// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "../interfaces/IValidator.sol";
import "../VersaWallet.sol";

abstract contract BaseValidator is IValidator {
    event WalletInited(address indexed wallet);
    event WalletCleared(address indexed wallet);

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    mapping(address => bool) _walletInited;

    modifier initializer {
        require(!_walletInited[msg.sender], "Has already inited");
        _;
    }

    modifier onlyEnabledValidator {
        require(
            VersaWallet(msg.sender).isValidatorEnabled(address(this)),
            "Validator is not enabled"
        );
        _;
    }

    function initWalletConfig(bytes memory data)
        external
        initializer
        onlyEnabledValidator
    {
        _init(data);
        emit WalletInited(msg.sender);
    }

    function clearWalletConfig() external onlyEnabledValidator {
        _clear();
        emit WalletCleared(msg.sender);
    }

    function _init(bytes memory data) internal virtual {}

    function _clear() internal virtual {}

    function isWalletInited(address wallet) external view returns(bool) {
        return _walletInited[wallet];
    }
}
