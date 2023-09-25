// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "../common/SelfAuthorized.sol";
import "../library/AddressLinkedList.sol";
import "../interface/IValidator.sol";

/**
 * @title ValidatorManager
 * @notice The validator is an extension of a `module` which implements `IValidator` interface
 * The validators are classified as "sudo" or "normal" based on their security level. If a
 * signature passes the authentication of a sudo validator, then the operation being signed
 * will have full permissions of the wallet. Otherwise it will only have limited access.
 * ⚠️ WARNING: A wallet MUST always have at least one sudo validator.
 */
abstract contract ValidatorManager is SelfAuthorized {
    using AddressLinkedList for mapping(address => address);

    event EnabledValidator(address indexed validator);
    event DisabledValidator(address indexed validator);
    event DisabledValidatorWithError(address indexed validator);

    enum ValidatorType {
        Disabled,
        Sudo,
        Normal
    }

    mapping(address => address) internal sudoValidators;
    mapping(address => address) internal normalValidators;

    /**
     * @notice Enables the validator `validator` for the Versa Wallet with the specified `validatorType`.
     * @dev This can only be done via a Versa Wallet transaction.
     * @param validatorData The first 20 bytes is the address of the validator,
     * the next 1 bytes is the validator type, and the rest is the initialization data for the validator contract.
     */
    function enableValidator(bytes calldata validatorData) public authorized {
        _enableValidator(validatorData);
    }

    /**
     * @notice Disables the validator `validator` for the Versa Wallet.
     * @dev This can only be done via a Versa Wallet transaction.
     * @param prevValidator The previous validator in the validators linked list.
     * @param validator The validator to be removed.
     */
    function disableValidator(address prevValidator, address validator) public authorized {
        _disableValidator(prevValidator, validator);
    }

    /**
     * @notice Toggles the type of the validator `validator` between Sudo and Normal.
     * @dev This can only be done via a Versa Wallet transaction.
     * @param prevValidator The previous validator in the validators linked list.
     * @param validator The validator to toggle the type.
     */
    function toggleValidatorType(address prevValidator, address validator) public authorized {
        _toggleValidatorType(prevValidator, validator);
    }

    function validatorSize() external view returns (uint256 sudoSize, uint256 normalSize) {
        sudoSize = sudoValidators.size();
        normalSize = normalValidators.size();
    }

    /**
     * @notice Returns the type of the validator `validator`.
     * @param validator The validator to check.
     * @return The type of the validator (Disabled, Sudo, or Normal).
     */
    function getValidatorType(address validator) public view returns (ValidatorType) {
        if (normalValidators.isExist(validator)) {
            return ValidatorType.Normal;
        } else if (sudoValidators.isExist(validator)) {
            return ValidatorType.Sudo;
        } else {
            return ValidatorType.Disabled;
        }
    }

    /**
     * @notice Checks if the validator `validator` is enabled.
     * @param validator The validator to check.
     * @return True if the validator is enabled, false otherwise.
     */
    function isValidatorEnabled(address validator) public view returns (bool) {
        if (getValidatorType(validator) != ValidatorType.Disabled) {
            return true;
        }
        return false;
    }

    /**
     * @notice Returns an array of validators based on the specified `validatorType`.
     * @param start Start of the page. Has to be a validator or start pointer (0x1 address).
     * @param pageSize Maximum number of validators that should be returned. Must be greater than 0.
     * @param validatorType The type of validators to retrieve (Sudo or Normal).
     * @return array An array of validators.
     */
    function getValidatorsPaginated(
        address start,
        uint256 pageSize,
        ValidatorType validatorType
    ) external view returns (address[] memory array) {
        require(validatorType != ValidatorType.Disabled, "E306");

        if (validatorType == ValidatorType.Sudo) {
            return sudoValidators.list(start, pageSize);
        } else {
            return normalValidators.list(start, pageSize);
        }
    }

    /**
     * @notice Internal function to enable a validator with the specified type and initialization data.
     * @param validatorData The first 20 bytes is the address of the validator, the next 1 bytes is the validator type,
     * and the rest is the initialization data for the validator contract.
     */
    function _enableValidator(bytes calldata validatorData) internal {
        require(validatorData.length >= 21, "E307");
        address validator = address(bytes20(validatorData[0:20]));
        ValidatorType validatorType = ValidatorType(uint8(validatorData[20]));
        bytes calldata initData = validatorData[21:];
        require(
            validatorType != ValidatorType.Disabled &&
                IValidator(validator).supportsInterface(type(IValidator).interfaceId),
            "E308"
        );
        require(!sudoValidators.isExist(validator) && !normalValidators.isExist(validator), "E309");

        if (validatorType == ValidatorType.Sudo) {
            sudoValidators.add(validator);
        } else {
            normalValidators.add(validator);
        }

        IValidator(validator).initWalletConfig(initData);
        emit EnabledValidator(validator);
    }

    /**
     * @notice Internal function to disable a validator from the Versa Wallet.
     * @param prevValidator The previous validator in the validators linked list.
     * @param validator The validator to be disabled.
     */
    function _disableValidator(address prevValidator, address validator) internal {
        // We use low level call here to make sure this call won't revert the whole transaction in any case
        (bool success, ) = validator.call(abi.encodeWithSelector(IModule.clearWalletConfig.selector, "0x"));
        if (success) {
            emit DisabledValidator(validator);
        } else {
            emit DisabledValidatorWithError(validator);
        }
        if (sudoValidators.isExist(validator)) {
            sudoValidators.remove(prevValidator, validator);
            _checkRemovingSudoValidator();
        } else if (normalValidators.isExist(validator)) {
            normalValidators.remove(prevValidator, validator);
        } else {
            revert("E310");
        }
    }

    /**
     * @notice Internal function to toggle the type of a validator between Sudo and Normal.
     * @param prevValidator The previous validator in the validators linked list.
     * @param validator The validator to toggle the type.
     */
    function _toggleValidatorType(address prevValidator, address validator) internal {
        if (normalValidators.isExist(validator)) {
            normalValidators.remove(prevValidator, validator);
            sudoValidators.add(validator);
        } else if (sudoValidators.isExist(validator)) {
            sudoValidators.remove(prevValidator, validator);
            _checkRemovingSudoValidator();
            normalValidators.add(validator);
        } else {
            revert("E310");
        }
    }

    /**
     * @notice Internal function to check if there is at least one sudo validator remaining.
     * @dev Throws an error if there are no remaining sudo validators.
     */
    function _checkRemovingSudoValidator() internal view {
        require(!sudoValidators.isEmpty(), "E311");
    }
}
