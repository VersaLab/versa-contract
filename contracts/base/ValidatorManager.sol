// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "../common/SelfAuthorized.sol";
import "../libraries/AddressLinkedList.sol";
import "../interfaces/IValidator.sol";

/**
 * @title ValidatorManager
 * @notice The validator is an extension of a `module` which implements `IValidator` interface
 * The validators are classified as "sudo" or "normal" based on their security level. If a
 * signature passes the authentication of a sudo validator, then the operation being signed
 * will have full permissions of the wallet. Otherwise it will only have limited access.
 * ⚠️ WARNING: A wallet MUST always have at least one sudo validator    
 */
abstract contract ValidatorManager is SelfAuthorized {
    using AddressLinkedList for mapping(address => address);

    event EnabledValidator(address indexed validator);
    event DisabledValidator(address indexed validator);
    event DisabledValidatorWithError(address indexed validator);
    event ExecutionFromValidatorSuccess(address indexed validator);
    event ExecutionFromMValidatorFailure(address indexed validator);

    enum ValidatorType {
        Disabled,
        Sudo,
        Normal
    }

    mapping(address => address) internal sudoValidators;
    mapping(address => address) internal normalValidators;
 
    function enableValidator(
        address validator,
        ValidatorType validatorType,
        bytes calldata initData
    ) public authorized {
        _enableValidator(validator, validatorType, initData);
    }

    function disableValidator(address prevValidator, address validator) public authorized {
        _disableValidator(prevValidator, validator);
    }

    function toggleValidatorType(address prevValidator, address validator) public authorized {
        _toggleValidatorType(prevValidator, validator);
    }

    function getValidatorType(address validator) public view returns(ValidatorType) {
        if (normalValidators.isExist(validator)) {
            return ValidatorType.Normal;
        } else if (sudoValidators.isExist(validator)) {
            return ValidatorType.Sudo;
        } else {
            return ValidatorType.Disabled;
        }
    }

    function isValidatorEnabled(address validator) public view returns(bool) {
        if (getValidatorType(validator) != ValidatorType.Disabled) {
            return true;
        }
        return false;
    }

    /**
     * @notice Returns an array of validators.
     * @param start Start of the page. Has to be a validator or start pointer (0x1 address)
     * @param pageSize Maximum number of validators that should be returned. Has to be > 0
     * @return array Array of validators.
     */
    function getValidatorsPaginated(
        address start,
        uint256 pageSize,
        ValidatorType validatorType
    ) external view returns (address[] memory array) {
        require(validatorType != ValidatorType.Disabled, "Only valid validators");
        if (validatorType == ValidatorType.Sudo) {
            return sudoValidators.list(start, pageSize);
        } else if (validatorType == ValidatorType.Normal) {
            return normalValidators.list(start, pageSize);
        }
    }

    function _enableValidator(address validator, ValidatorType validatorType, bytes calldata initData) internal {
        require(
            validatorType != ValidatorType.Disabled
            && IValidator(validator).supportsInterface(type(IValidator).interfaceId),
            "Only valid validator allowed"
        );
        require(
            !sudoValidators.isExist(validator) && !normalValidators.isExist(validator),
            "Validator has already been added"
        );
        if(validatorType == ValidatorType.Sudo) {
            sudoValidators.add(validator);
        } else {
            normalValidators.add(validator);
        }
        IValidator(validator).initWalletConfig(initData);
        emit EnabledValidator(validator);
    }

    function _disableValidator(address prevValidator, address validator) internal {
        if (sudoValidators.isExist(validator)) {
            sudoValidators.remove(prevValidator, validator);
            _checkRemovingSudoValidator();
        } else if (normalValidators.isExist(validator)) {
            normalValidators.remove(prevValidator, validator);
        } else {
            revert("Validator doesn't exist");
        }
        try IValidator(validator).clearWalletConfig() {
            emit DisabledValidator(validator);
        } catch {
            emit DisabledValidatorWithError(validator);
        }
    }

    function _toggleValidatorType(address prevValidator, address validator) internal {
        if (normalValidators.isExist(validator)) {
            normalValidators.remove(prevValidator, validator);
            sudoValidators.add(validator);
        } else if (sudoValidators.isExist(validator)) {
            sudoValidators.remove(prevValidator, validator);
            _checkRemovingSudoValidator();
            normalValidators.add(validator);
        } else {
            revert("Validator doesn't exist");
        }
    }

    function _checkRemovingSudoValidator() internal view {
        require(
            !sudoValidators.isEmpty(),
            "Cannot remove the last remaining sudoValidator"
        );
    }
}
