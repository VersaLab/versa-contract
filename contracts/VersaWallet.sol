// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@aa-template/contracts/interfaces/IAccount.sol";
import "@aa-template/contracts/interfaces/IEntryPoint.sol";
import "./common/Singleton.sol";
import "./common/Enum.sol";
import "./base/FallbackManager.sol";
import "./base/EntryPointManager.sol";
import "./base/PluginManager.sol";
import "./interfaces/IValidator.sol";

/// @title VersaWallet - A Smart contract wallet supports EIP4337 based on Safe
contract VersaWallet is
    Singleton,
    Initializable,
    EntryPointManager,
    PluginManager,
    FallbackManager,
    IAccount
{
    enum ExecutionType {
        Sudo,
        Normal
    }

    string public constant VERSA_VERSION = "0.0.1";

    // `sudoExecute` function selector
    bytes4 internal constant SUDO_EXECUTE = 0x7df9bf29;
    // `batchSudoExecute` function selector
    bytes4 internal constant BATCH_SUDO_EXECUTE = 0x7e5f1c3f;

    /// @dev Disable initializers to prevent the implementation contract
    /// from being used
    constructor(address entryPoint) EntryPointManager(entryPoint) {
        _disableInitializers();
    }

    /// @dev Set up fallbackmanager and initial plugins
    function initialize(
        address fallbackHandler,
        address[] memory validators,
        bytes[] calldata validatorInitData,
        ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] calldata hooksInitData,
        address[] memory modules,
        bytes[] calldata moduleInitData
    ) external initializer {
        _checkInitializationDataLength(
            validators.length, validatorInitData.length, validatorType.length,
            hooks.length, hooksInitData.length,
            modules.length, moduleInitData.length
        );
        internalSetFallbackHandler(fallbackHandler);

        uint256 i;
        bool hasSudoValidator;
        for (i = 0; i < validators.length; ++i) {
            _enableValidator(validators[i], validatorType[i], validatorInitData[i]);
            if (validatorType[i] == ValidatorType.Sudo) {
                hasSudoValidator = true;
            }
        }
        require(hasSudoValidator, "Must set up the initial sudo validator");
        for (i = 0; i < hooks.length; ++i) {
            _enableHooks(hooks[i], hooksInitData[i]);
        }
        for (i = 0; i < modules.length; ++i) {
            _enableModule(modules[i], moduleInitData[i]);
        }
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external
      override
      onlyFromEntryPoint
      returns(uint256 validationData)
    {
        address validator = _getValidator(userOp.signature);
        _validateValidatorAndSelector(validator, bytes4(userOp.callData[0:4]));
        validationData = IValidator(validator).validateSignature(userOp, userOpHash);
        _payPrefund(missingAccountFunds);
    }

    function sudoExecute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external onlyFromEntryPoint {
        _internalExecute(to, value, data, operation, ExecutionType.Sudo);
    }

    function normalExecute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external onlyFromEntryPoint {
        _internalExecute(to, value, data, operation, ExecutionType.Normal);
    }

    function batchSudoExecute(
        address[] memory to,
        uint256[] memory value,
        bytes[] memory data,
        Enum.Operation[] memory operation
    ) external onlyFromEntryPoint {
        _checkBatchDataLength(to.length, value.length, data.length, operation.length);
        for (uint256 i = 0; i < to.length; ++i) {
            _internalExecute(to[i], value[i], data[i], operation[i], ExecutionType.Sudo);
        }
    }

    function batchNormalExecute(
        address[] memory to,
        uint256[] memory value,
        bytes[] memory data,
        Enum.Operation[] memory operation
    ) external onlyFromEntryPoint {
        _checkBatchDataLength(to.length, value.length, data.length, operation.length);
        for (uint256 i = 0; i < to.length; ++i) {
            _internalExecute(to[i], value[i], data[i], operation[i], ExecutionType.Normal);
        }
    }

    function _internalExecute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        ExecutionType execution
    ) internal {
        if (execution == ExecutionType.Sudo) {
            executeAndRevert(to, value, data, operation);
        } else {
            _checkNormalExecute(to, operation);
            _beforeTransaction(to, value, data, operation);
            executeAndRevert(to, value, data, operation);
            _afterTransaction(to, value, data, operation);
        }
    }

    /**
     * sends to the entrypoint (msg.sender) the missing funds for this transaction.
     * subclass MAY override this method for better funds management
     * (e.g. send to the entryPoint more than the minimum required, so that in future transactions
     * it will not be required to send again)
     * @param _missingAccountFunds the minimum value this method should send the entrypoint.
     *  this value MAY be zero, in case there is enough deposit, or the userOp has a paymaster.
     */
    function _payPrefund(uint256 _missingAccountFunds) internal {
        if (_missingAccountFunds > 0) {
            //Note: MAY pay more than the minimum, to deposit for future transactions
            (bool success, ) = payable(entryPoint()).call{value: _missingAccountFunds, gas: type(uint256).max}("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not account.)
        }
    }

    /// @dev Extract the validator address from the first 20 bytes of the signature
    function _getValidator(bytes calldata signature) internal pure returns(address) {
        return address(bytes20(signature[0:20]));
    }

    function _validateValidatorAndSelector(address _validator, bytes4 _selector) internal view {
        ValidatorType validatorType = getValidatorType(_validator);
        require(validatorType != ValidatorType.Disabled, "Versa: invalid validator");
        if (_selector == SUDO_EXECUTE || _selector == BATCH_SUDO_EXECUTE) {
            require(validatorType == ValidatorType.Sudo, "Versa: selector doesn't match validator");
        }
    }

    /// @dev Normal transactions have following restrictions:
    ///     1. Cannot selfcall, i.e., change wallet's config
    ///     2. Cannot call to an enabled plugin, i.e, change plugin's config
    ///     3. Cannot perform a delegatecall(besides `to` is the MultiSendOnly contract)
    function _checkNormalExecute(address to, Enum.Operation _operation) internal view {
        require(
            to != address(this) &&
            !_isPluginEnabled(to) &&
            _operation != Enum.Operation.DelegateCall,
            "Versa: operation is not allowed"
        );
    }

    function _checkBatchDataLength(uint256 toLen, uint256 valueLen, uint256 dataLen, uint256 operationLen) internal pure {
        require(toLen == valueLen && dataLen == operationLen && toLen == dataLen, "Data length doesn't match");
    }

    function _checkInitializationDataLength(
        uint256 validatorsLen,
        uint256 validatorInitLen,
        uint256 validatorTypeLen,
        uint256 hooksLen,
        uint256 hooksInitDataLen,
        uint256 modulesLen,
        uint256 moduleInitLen
    ) internal pure {
        require(
            validatorsLen == validatorInitLen && validatorInitLen == validatorTypeLen
            && hooksLen == hooksInitDataLen
            && modulesLen == moduleInitLen,
            "Data length doesn't match"
        );
    }
}
