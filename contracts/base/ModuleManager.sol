// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.17;

import "../common/Enum.sol";
import "../common/SelfAuthorized.sol";
import "../interfaces/IModule.sol";
import "../libraries/AddressLinkedList.sol";

/**
 * @title Module Manager - A contract managing Versa modules, modified from Versa Wallet's ModuleManager
 * @notice Modules are extensions with unlimited access to a Wallet that can be added to a Wallet by its super users.
           ⚠️ WARNING: Modules are a security risk since they can execute arbitrary transactions, 
           so only trusted and audited modules should be added to a Versa wallet. A malicious module can
           completely takeover a Versa wallet.
 */
abstract contract ModuleManager is SelfAuthorized {
    using AddressLinkedList for mapping(address => address);

    event EnabledModule(address indexed module);
    event DisabledModule(address indexed module);
    event DisabledModuleWithError(address indexed module);
    event ExecutionFromModuleSuccess(address indexed module);
    event ExecutionFromModuleFailure(address indexed module);

    mapping(address => address) internal modules;

    /**
     * @notice Enables the module `module` for the Versa Wallet.
     * @dev This can only be done via a Versa Wallet transaction.
     * @param module Module to be whitelisted.
     */
    function enableModule(address module, bytes calldata initData) public authorized {
        _enableModule(module, initData);
    }

    /**
     * @notice Disables the module `module` for the Versa Wallet.
     * @dev This can only be done via a Versa Wallet transaction.
     * @param prevModule Previous module in the modules linked list.
     * @param module Module to be removed.
     */
    function disableModule(address prevModule, address module) public authorized {
        _disableModule(prevModule, module);
        emit DisabledModule(module);
    }

    /**
     * @notice Returns if an module is enabled
     * @return True if the module is enabled
     */
    function isModuleEnabled(address module) public view returns (bool) {
        return _isModuleEnabled(module);
    }

    /**
     * @notice Returns an array of modules.
     * @param start Start of the page. Has to be a module or start pointer (0x1 address)
     * @param pageSize Maximum number of modules that should be returned. Has to be > 0
     * @return array Array of modules.
     */
    function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory array) {
        return modules.list(start, pageSize);
    }

    function _enableModule(address module, bytes calldata initData) internal {
        require(
            IModule(module).supportsInterface(type(IModule).interfaceId),
            "Not a module"
        );
        modules.add(module);
        IModule(module).initWalletConfig(initData);
        emit EnabledModule(module);
    }

    function _disableModule(address prevModule, address module) internal {
        modules.remove(prevModule, module);
        try IModule(module).clearWalletConfig() {
            emit DisabledModule(module);
        } catch {
            emit DisabledModuleWithError(module);
        }
    }

    /**
     * @notice Returns if an module is enabled
     * @return True if the module is enabled
     */
    function _isModuleEnabled(address module) internal view returns (bool) {
        return modules.isExist(module);
    }
}
