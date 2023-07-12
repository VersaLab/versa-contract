// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./BaseHooks.sol";

/**
 * @title SpendingLimitHooks
 */
contract SpendingLimitHooks is BaseHooks {
    struct SpendingLimitSetConfig {
        address tokenAddress; // The address of the token that needs spending limit
        uint256 allowanceAmount; // The maximum amount of the token allowed to be spent within resetTimeIntervalMinutes
        uint32 resetBaseTimeMinutes; // Base time reference value for calculation (timestamp to minutes)
        uint16 resetTimeIntervalMinutes; // Reset time interval (minutes)
    }

    struct SpendingLimitInfo {
        uint256 allowanceAmount; // The maximum amount of the token allowed to be spent within resetTimeIntervalMinutes
        uint256 spentAmount; // The amount of the token has been spent within resetTimeIntervalMinutes
        uint32 lastResetTimeMinutes; // Last reset time (timestamp to minutes)
        uint16 resetTimeIntervalMinutes; // Reset time interval (minutes)
    }

    event SetSpendingLimit(
        address indexed _wallet,
        address indexed _token,
        uint256 _allowanceAmount,
        uint32 _resetBaseTimeMinutes,
        uint16 _resetTimeIntervalMinutes
    );
    event ResetSpendingLimit(address indexed _wallet, address indexed _token);
    event DeleteSpendingLimit(address indexed _wallet, address indexed _token);

    error SpendingLimitSimulate();

    // Wallet -> Token -> SpendingLimitInfo
    mapping(address => mapping(address => SpendingLimitInfo)) internal _tokenSpendingLimitInfo;
    mapping(address => bool) internal _walletInited;

    // ERC20 Token Method Selector
    bytes4 internal constant TRANSFER = ERC20.transfer.selector;
    bytes4 internal constant TRANSFER_FROM = ERC20.transferFrom.selector;
    bytes4 internal constant APPROVE = ERC20.approve.selector;
    bytes4 internal constant INCREASE_ALLOWANCE = ERC20.increaseAllowance.selector;

    /**
     * @dev Internal function to handle wallet initialization.
     * @param _data The initialization data.
     */
    function _init(bytes memory _data) internal override {
        if (_data.length > 0) {
            SpendingLimitSetConfig[] memory initialSetConfigs = _parseSpendingLimitSetConfigData(_data);
            _batchSetSpendingLimit(initialSetConfigs);
        }
        _walletInited[msg.sender] = true;
    }

    /**
     * @dev Internal function to handle wallet configuration clearing.
     */
    function _clear() internal override {}

    /**
     * @dev Checks if the specified wallet has been initialized.
     * @return A boolean indicating if the wallet is initialized.
     */
    function _isWalletInited(address wallet) internal view override returns (bool) {
        return _walletInited[wallet];
    }

    /**
     * @dev Internal function to update the spending limit information for a specific token and wallet.
     * @param _token The address of the token.
     * @param _spendingLimitInfo The updated spending limit information to be stored.
     */
    function _updateSpendingLimitInfo(address _token, SpendingLimitInfo memory _spendingLimitInfo) internal {
        _tokenSpendingLimitInfo[msg.sender][_token] = _spendingLimitInfo;
    }

    /**
     * @dev Internal function to check spent amount and update the spending limit information.
     * @param _token The address of the token.
     * @param _spendingLimitInfo The updated spending limit information to be stored.
     */
    function _checkAmountAndUpdate(address _token, SpendingLimitInfo memory _spendingLimitInfo) internal {
        // Ensure that the spent amount does not exceed the allowance amount
        require(
            _spendingLimitInfo.spentAmount <= _spendingLimitInfo.allowanceAmount,
            "SpendingLimitHooks: token overspending"
        );
        _updateSpendingLimitInfo(_token, _spendingLimitInfo);
    }

    /**
     * @dev Internal function to check the spending limit before a transaction.
     * @param _wallet The address of the wallet initiating the transaction.
     * @param _to The address of the recipient of the transaction.
     * @param _value The value of the transaction.
     * @param _data The data associated with the transaction.
     * @param _operation The type of operation being performed.
     */
    function _checkSpendingLimit(
        address _wallet,
        address _to,
        uint256 _value,
        bytes calldata _data,
        Enum.Operation _operation
    ) internal {
        require(_operation != Enum.Operation.DelegateCall, "SpendingLimitHooks: not allow delegatecall");

        // Check spending limit for native token
        if (_value > 0) {
            _checkNativeTokenSpendingLimit(_wallet, _value);
        }

        // Check spending limit for ERC20 token
        uint256 dataLength = _data.length;
        if (dataLength > 0) {
            _checkERC20TokenSpendingLimit(_wallet, _to, _data);
        }
    }

    /**
     * @dev Internal function to check the spending limit for native token.
     * @param _wallet The address of the wallet.
     * @param _value The value of the transaction.
     */
    function _checkNativeTokenSpendingLimit(address _wallet, uint256 _value) internal {
        SpendingLimitInfo memory spendingLimitInfo = getSpendingLimitInfo(_wallet, address(0));

        // Check if there is a spending limit set for this wallet
        if (spendingLimitInfo.allowanceAmount > 0) {
            // Update the spent amount with the transaction value
            spendingLimitInfo.spentAmount += _value;
            _checkAmountAndUpdate(address(0), spendingLimitInfo);
        }
    }

    /**
     * @dev Internal function to check the spending limit for an ERC20 token.
     * @param _wallet The address of the wallet.
     * @param _token The address of the ERC20 token.
     * @param _data The transaction data.
     */
    function _checkERC20TokenSpendingLimit(address _wallet, address _token, bytes calldata _data) internal {
        SpendingLimitInfo memory spendingLimitInfo = getSpendingLimitInfo(_wallet, _token);

        // Check if there is a spending limit set for this token
        if (spendingLimitInfo.allowanceAmount > 0) {
            bytes4 methodSelector = bytes4(_data[:4]);
            if (methodSelector == TRANSFER || methodSelector == INCREASE_ALLOWANCE) {
                (address target, uint256 value) = abi.decode(_data[4:], (address, uint256));
                if (target != msg.sender) {
                    spendingLimitInfo.spentAmount += value;
                    _checkAmountAndUpdate(_token, spendingLimitInfo);
                }
            } else if (methodSelector == TRANSFER_FROM) {
                (address target, , uint256 value) = abi.decode(_data[4:], (address, address, uint256));
                if (target == msg.sender) {
                    spendingLimitInfo.spentAmount += value;
                    _checkAmountAndUpdate(_token, spendingLimitInfo);
                }
            } else if (methodSelector == APPROVE) {
                (address target, uint256 value) = abi.decode(_data[4:], (address, uint256));
                if (target != msg.sender) {
                    uint256 preAllowanceAmount = ERC20(_token).allowance(_wallet, target);
                    if (value > preAllowanceAmount) {
                        spendingLimitInfo.spentAmount = spendingLimitInfo.spentAmount + value - preAllowanceAmount;
                        _checkAmountAndUpdate(_token, spendingLimitInfo);
                    }
                }
            }
        }
    }

    /**
     * @dev Parses the provided data to extract SpendingLimitSetConfig configurations.
     * @param _data The data containing SpendingLimitSetConfig configurations.
     * @return An array of SpendingLimitSetConfig objects.
     */
    function _parseSpendingLimitSetConfigData(
        bytes memory _data
    ) internal pure returns (SpendingLimitSetConfig[] memory) {
        SpendingLimitSetConfig[] memory spendingLimitSetConfigs = abi.decode(_data, (SpendingLimitSetConfig[]));
        require(spendingLimitSetConfigs.length > 0, "SpendingLimitHooks: parse error");
        return spendingLimitSetConfigs;
    }

    /**
     * @dev Sets the spending limit for the caller based on the provided SpendingLimitSetConfig.
     * @param _config The SpendingLimitSetConfig to set the spending limit.
     */
    function _setSpendingLimit(SpendingLimitSetConfig memory _config) internal {
        if (_config.tokenAddress != address(0)) {
            try ERC20(_config.tokenAddress).totalSupply() returns (uint256 totalSupply) {
                require(totalSupply != 0, "SpendingLimitHooks: illegal token address");
            } catch {
                revert("SpendingLimitHooks: illegal token address");
            }
        }
        SpendingLimitInfo memory spendingLimitInfo = getSpendingLimitInfo(msg.sender, _config.tokenAddress);
        uint32 currentTimeMinutes = uint32(block.timestamp / 60);
        if (_config.resetBaseTimeMinutes > 0) {
            require(
                _config.resetBaseTimeMinutes <= currentTimeMinutes,
                "SpendingLimitHooks: resetBaseTimeMinutes can not greater than currentTimeMinutes"
            );
            spendingLimitInfo.lastResetTimeMinutes =
                currentTimeMinutes -
                ((currentTimeMinutes - _config.resetBaseTimeMinutes) % _config.resetTimeIntervalMinutes);
        } else if (spendingLimitInfo.lastResetTimeMinutes == 0) {
            spendingLimitInfo.lastResetTimeMinutes = currentTimeMinutes;
        }
        spendingLimitInfo.resetTimeIntervalMinutes = _config.resetTimeIntervalMinutes;
        spendingLimitInfo.allowanceAmount = _config.allowanceAmount;
        _updateSpendingLimitInfo(_config.tokenAddress, spendingLimitInfo);
        emit SetSpendingLimit(
            msg.sender,
            _config.tokenAddress,
            _config.allowanceAmount,
            _config.resetBaseTimeMinutes,
            _config.resetTimeIntervalMinutes
        );
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided SpendingLimitSetConfig array.
     * @param _configs An array of SpendingLimitSetConfig objects.
     */
    function _batchSetSpendingLimit(SpendingLimitSetConfig[] memory _configs) internal {
        uint dataLength = _configs.length;
        require(dataLength > 0, "SpendingLimitHooks: dataLength should greater than zero");
        for (uint i = 0; i < dataLength; i++) {
            _setSpendingLimit(_configs[i]);
        }
    }

    /**
     * @dev Sets the spending limit for the caller based on the provided SpendingLimitSetConfig.
     * @param _config The SpendingLimitSetConfig to set the spending limit.
     */
    function setSpendingLimit(SpendingLimitSetConfig memory _config) external onlyEnabledHooks {
        _setSpendingLimit(_config);
    }

    /**
     * @dev Sets spending limits for multiple tokens based on the provided SpendingLimitSetConfig array.
     * @param _configs An array of SpendingLimitSetConfig objects.
     */
    function batchSetSpendingLimit(SpendingLimitSetConfig[] memory _configs) external onlyEnabledHooks {
        _batchSetSpendingLimit(_configs);
    }

    /**
     * @dev Resets the spending limit for the caller and the specified token.
     * @param _token The token address for which to reset the spending limit.
     */
    function _resetSpendingLimit(address _token) internal {
        SpendingLimitInfo memory spendingLimitInfo = getSpendingLimitInfo(msg.sender, _token);
        spendingLimitInfo.spentAmount = 0;
        _updateSpendingLimitInfo(_token, spendingLimitInfo);
        emit ResetSpendingLimit(msg.sender, _token);
    }

    /**
     * @dev Resets the spending limit for the caller and the specified token.
     * @param _token The token address for which to reset the spending limit.
     */
    function resetSpendingLimit(address _token) external onlyEnabledHooks {
        _resetSpendingLimit(_token);
    }

    /**
     * @dev Batch reset spending limit for specified tokens.
     * @param _tokens An array containing the addresses of tokens for which spending limit is to be reset.
     *                Each element in the array represents the address of a token for which the limit will be reset.
     * @notice Only enabled hooks can call this function.
     */
    function batchResetSpendingLimit(address[] memory _tokens) external onlyEnabledHooks {
        uint dataLength = _tokens.length;
        require(dataLength > 0, "SpendingLimitHooks: dataLength should greater than zero");
        for (uint i = 0; i < dataLength; i++) {
            _resetSpendingLimit(_tokens[i]);
        }
    }

    /**
     * @dev Deletes the spending limit for the caller and the specified token.
     * @param _token The token address for which to delete the spending limit.
     */
    function _deleteSpendingLimit(address _token) internal {
        delete _tokenSpendingLimitInfo[msg.sender][_token];
        emit DeleteSpendingLimit(msg.sender, _token);
    }

    /**
     * @dev Deletes the spending limit for the caller and the specified token.
     * @param _token The token address for which to delete the spending limit.
     */
    function deleteSpendingLimit(address _token) external onlyEnabledHooks {
        _deleteSpendingLimit(_token);
    }

    /**
     * @dev Batch delete spending limit for specified tokens.
     * @param _tokens An array containing the addresses of tokens for which spending limit is to be deleted.
     *                Each element in the array represents the address of a token for which the limit will be deleted.
     * @notice Only enabled hooks can call this function.
     */
    function batchDeleteSpendingLimit(address[] memory _tokens) external onlyEnabledHooks {
        uint dataLength = _tokens.length;
        require(dataLength > 0, "SpendingLimitHooks: dataLength should greater than zero");
        for (uint i = 0; i < dataLength; i++) {
            _deleteSpendingLimit(_tokens[i]);
        }
    }

    /**
     * @dev Retrieves the spending limit information for the specified wallet and token.
     * @param _wallet The wallet address for which to retrieve the spending limit information.
     * @param _token The token address for which to retrieve the spending limit information.
     * @return SpendingLimitInfo The spending limit information for the specified wallet and token.
     */
    function getSpendingLimitInfo(address _wallet, address _token) public view returns (SpendingLimitInfo memory) {
        SpendingLimitInfo memory spendingLimitInfo = _tokenSpendingLimitInfo[_wallet][_token];
        uint32 currentTimeMinutes = uint32(block.timestamp / 60);
        if (
            spendingLimitInfo.resetTimeIntervalMinutes > 0 &&
            spendingLimitInfo.lastResetTimeMinutes + spendingLimitInfo.resetTimeIntervalMinutes <= currentTimeMinutes
        ) {
            spendingLimitInfo.spentAmount = 0;
            spendingLimitInfo.lastResetTimeMinutes =
                currentTimeMinutes -
                ((currentTimeMinutes - spendingLimitInfo.lastResetTimeMinutes) %
                    spendingLimitInfo.resetTimeIntervalMinutes);
        }
        return spendingLimitInfo;
    }

    /**
     * @dev Retrieves the spending limit information for multiple tokens for the specified wallet.
     * @param _wallet The wallet address for which to retrieve the spending limit information.
     * @param _tokens An array of token addresses for which to retrieve the spending limit information.
     * @return SpendingLimitInfo[] An array of spending limit information for the specified wallet and tokens.
     */
    function batchGetSpendingLimitInfo(
        address _wallet,
        address[] memory _tokens
    ) public view returns (SpendingLimitInfo[] memory) {
        uint dataLength = _tokens.length;
        require(dataLength > 0, "SpendingLimitHooks: dataLength should greater than zero");
        SpendingLimitInfo[] memory batchSpendingLimitInfo = new SpendingLimitInfo[](dataLength);
        for (uint i = 0; i < dataLength; i++) {
            batchSpendingLimitInfo[i] = getSpendingLimitInfo(_wallet, _tokens[i]);
        }
        return batchSpendingLimitInfo;
    }

    /**
     * @dev Returns the supported hooks of this contract.
     * @return The supported hooks (represented as a bitwise flag).
     */
    function hasHooks() external pure override returns (uint256) {
        return BEFORE_TXHOOKS_FLAG;
    }

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
        bytes calldata _data,
        Enum.Operation _operation
    ) external override onlyEnabledHooks {
        _checkSpendingLimit(msg.sender, _to, _value, _data, _operation);
    }

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
        bytes calldata _data,
        Enum.Operation _operation
    ) external view override onlyEnabledHooks {
        (_to, _value, _data, _operation);
        revert("SpendingLimitHooks: afterTransaction hook is not allowed");
    }

    /**
     * @dev Simulates a limited transaction by checking the spending limit for the specified wallet.
     * @param _wallet The wallet address to simulate the transaction for.
     * @param _to The destination address of the transaction.
     * @param _value The value (amount) of the transaction.
     * @param _data The additional data for the transaction.
     * @param _operation The operation type of the transaction.
     */
    function simulateSpendingLimitTransaction(
        address _wallet,
        address _to,
        uint256 _value,
        bytes calldata _data,
        Enum.Operation _operation
    ) external {
        require(
            VersaWallet(payable(_wallet)).isHooksEnabled(address(this)),
            "SpendingLimitHooks: this hooks is not enabled"
        );
        _checkSpendingLimit(_wallet, _to, _value, _data, _operation);
        revert SpendingLimitSimulate();
    }
}
