// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

import "../../interface/IHooks.sol";
import "../../VersaWallet.sol";

/**
 * @title BaseHooks
 * @dev Base contract for hooks implementation.
 */
abstract contract BaseHooks is IHooks {
    event InitWalletConfig(address indexed _wallet);
    event ClearWalletConfig(address indexed _wallet);

    mapping(address => bool) private _walletInitStatus;

    uint256 internal constant BEFORE_TXHOOKS_FLAG = 1 << 128;
    uint256 internal constant AFTER_TXHOOKS_FLAG = 1;

    /**
     * @dev Modifier to check if the hooks is enabled for the caller wallet.
     */
    modifier onlyEnabledHooks() {
        require(VersaWallet(payable(msg.sender)).isHooksEnabled(address(this)), "Hooks: this hooks is not enabled");
        _;
    }

    /**
     * @dev Initializes the wallet configuration.
     * @param _data The initialization data.
     */
    function initWalletConfig(bytes memory _data) external onlyEnabledHooks {
        if (!_walletInitStatus[msg.sender]) {
            _walletInitStatus[msg.sender] = true;
            _init(_data);
            emit InitWalletConfig(msg.sender);
        }
    }

    /**
     * @dev Clears the wallet configuration. Triggered when disabled by a wallet
     */
    function clearWalletConfig() external onlyEnabledHooks {
        if (_walletInitStatus[msg.sender]) {
            _walletInitStatus[msg.sender] = false;
            _clear();
            emit ClearWalletConfig(msg.sender);
        }
    }

    /**
     * @dev Internal function to handle wallet initialization.
     * Subclass must implement this function
     * @param _data The initialization data.
     */
    function _init(bytes memory _data) internal virtual {}

    /**
     * @dev Internal function to handle wallet configuration clearing.
     * Subclass must implement this function
     */
    function _clear() internal virtual {}

    /**
     * @dev Returns the supported hooks of this contract.
     * @return The supported hooks (represented as a bitwise flag).
     */
    function hasHooks() external pure virtual returns (uint256) {}

    /**
     * @dev Perform before transaction actions.
     * @param _to The address to which the transaction is sent.
     * @param _value The value of the transaction.
     * @param _data Additional data of the transaction.
     * @param _operation The type of the transaction operation.
     */
    function beforeTransaction(
        address _to,
        uint256 _value,
        bytes memory _data,
        Enum.Operation _operation
    ) external virtual onlyEnabledHooks {}

    /**
     * @dev Perform after transaction actions.
     * @param _to The address to which the transaction is sent.
     * @param _value The value of the transaction.
     * @param _data Additional data of the transaction.
     * @param _operation The type of the transaction operation.
     */
    function afterTransaction(
        address _to,
        uint256 _value,
        bytes memory _data,
        Enum.Operation _operation
    ) external virtual onlyEnabledHooks {}

    /**
     * @dev Checks if the contract supports a specific interface.
     * @param _interfaceId The interface ID to check.
     * @return True if the contract supports the interface, false otherwise.
     */
    function supportsInterface(bytes4 _interfaceId) external pure returns (bool) {
        return _interfaceId == type(IHooks).interfaceId;
    }

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @param _wallet The wallet address to check.
     * @return A boolean indicating if the wallet is initialized.
     */
    function isWalletInited(address _wallet) external view returns (bool) {
        return _walletInitStatus[_wallet];
    }
}
