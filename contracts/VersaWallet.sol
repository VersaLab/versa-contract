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

/**
 * @title VersaWallet - A Smart contract wallet that supports EIP4337
 */
contract VersaWallet is
    Singleton,
    Initializable,
    EntryPointManager,
    PluginManager,
    FallbackManager,
    IAccount
{
    /**
     * @dev The execution type of a transaction.
     * - Sudo: Transaction executed with full permissions.
     * - Normal: Regular transaction executed limited access.
     */
    enum ExecutionType {
        Sudo,
        Normal
    }

    string public constant VERSA_VERSION = "0.0.1";

    // `sudoExecute` function selector
    bytes4 internal constant SUDO_EXECUTE = 0x7df9bf29;
    // `batchSudoExecute` function selector
    bytes4 internal constant BATCH_SUDO_EXECUTE = 0x7e5f1c3f;

    /**
     * @dev Disable initializers to prevent the implementation contract
     * from being used
     */
    constructor(address entryPoint) EntryPointManager(entryPoint) {
        _disableInitializers();
    }

    /**
     * @dev Initializes the VersaWallet contract.
     * @param fallbackHandler The address of the fallback handler contract.
     * @param validators The addresses of the validators.
     * @param validatorInitData The initialization data for each validator.
     * @param validatorType The types of the validators.
     * @param hooks The addresses of the hooks.
     * @param hooksInitData The initialization data for each hook.
     * @param modules The addresses of the modules.
     * @param moduleInitData The initialization data for each module.
     */
    function initialize(
        address fallbackHandler,
        address[] memory validators,
        bytes[] memory validatorInitData,
        ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData
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

    /**
     * @dev Validates an user operation before execution.
     * @param userOp The user operation data.
     * @param userOpHash The hash of the user operation.
     * @param missingAccountFunds The amount of missing account funds to be paid.
     * @return validationData The validation data returned by the validator.
     */
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

    /**
     * @dev Executes a sudo transaction.
     * @param to The address to which the transaction is directed.
     * @param value The value of the transaction.
     * @param data The data of the transaction.
     * @param operation The operation type of the transaction.
     */
    function sudoExecute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external onlyFromEntryPoint {
        _internalExecute(to, value, data, operation, ExecutionType.Sudo);
    }

    /**
     * @dev Executes a normal transaction.
     * @param to The address to which the transaction is directed.
     * @param value The value of the transaction.
     * @param data The data of the transaction.
     * @param operation The operation type of the transaction.
     */
    function normalExecute(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external onlyFromEntryPoint {
        _internalExecute(to, value, data, operation, ExecutionType.Normal);
    }

    /**
     * @dev Executes a batch transaction with sudo privileges.
     * @param to The addresses to which the transactions are directed.
     * @param value The values of the transactions.
     * @param data The data of the transactions.
     * @param operation The operation types of the transactions.
     */
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

    /**
     * @dev Executes a batch normal transaction.
     * @param to The addresses to which the transactions are directed.
     * @param value The values of the transactions.
     * @param data The data of the transactions.
     * @param operation The operation types of the transactions.
     */
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

    /**
     * @dev Internal function to execute a transaction.
     * @param to The address to which the transaction is directed.
     * @param value The value of the transaction.
     * @param data The data of the transaction.
     * @param operation The operation type of the transaction.
     * @param execution The execution type of the transaction.
     */
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
     * @dev Sends the missing funds for this transaction to the entry point (msg.sender).
     * Subclasses may override this method for better funds management
     * (e.g., send more than the minimum required to the entry point so that in future transactions
     * it will not be required to send again).
     * @param missingAccountFunds The minimum value this method should send to the entry point.
     * This value may be zero in case there is enough deposit or the userOp has a paymaster.
     */
    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            // Note: May pay more than the minimum to deposit for future transactions
            (bool success, ) = payable(entryPoint()).call{value: missingAccountFunds, gas: type(uint256).max}("");
            (success);
            // Ignore failure (it's EntryPoint's job to verify, not the account)
        }
    }

    /**
     * @dev Extracts the validator address from the first 20 bytes of the signature.
     * @param signature The signature from which to extract the validator address.
     * @return The extracted validator address.
     */
    function _getValidator(bytes calldata signature) internal pure returns(address) {
        return address(bytes20(signature[0:20]));
    }

    /**
     * @dev Validates the validator and selector for a user operation.
     * @param _validator The address of the validator to validate.
     * @param _selector The selector of the user operation.
     */
    function _validateValidatorAndSelector(address _validator, bytes4 _selector) internal view {
        ValidatorType validatorType = getValidatorType(_validator);
        require(validatorType != ValidatorType.Disabled, "Versa: invalid validator");
        if (_selector == SUDO_EXECUTE || _selector == BATCH_SUDO_EXECUTE) {
            require(validatorType == ValidatorType.Sudo, "Versa: selector doesn't match validator");
        }
    }

    /**
     * @dev A normal execution has following restrictions:
     * 1. Cannot selfcall, i.e., change wallet's config
     * 2. Cannot call to an enabled plugin, i.e, change plugin's config or call wallet from plugin
     * 3. Cannot perform a delegatecall
     * @param to The address to which the transaction is directed.
     * @param _operation The operation type of the transaction.
     */
    function _checkNormalExecute(address to, Enum.Operation _operation) internal view {
        require(
            to != address(this) &&
            !_isPluginEnabled(to) &&
            _operation != Enum.Operation.DelegateCall,
            "Versa: operation is not allowed"
        );
    }

    /**
     * @dev Checks the lengths of the batch transaction data arrays.
     */
    function _checkBatchDataLength(uint256 toLen, uint256 valueLen, uint256 dataLen, uint256 operationLen) internal pure {
        require(toLen == valueLen && dataLen == operationLen && toLen == dataLen, "Versa: invalid batch data");
    }

    /** 
     * @dev Check the length of the initialization data arrays
    */
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
