// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.17;

import "../common/Enum.sol";
import "../common/SelfAuthorized.sol";
import "../interfaces/IModule.sol";
import "../libraries/AddressLinkedList.sol";

/**
 * @title Module Manager
 * @dev A contract managing Versa modules.
 * @notice Modules are extensions with unlimited access to a Wallet that can be added to a Wallet by its super users.
 * ⚠️ WARNING: Modules are a security risk since they can execute arbitrary transactions, so only trusted and audited
 *   modules should be added to a Versa wallet. A malicious module can completely take over a Versa wallet.
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
     * @param module The module to be enabled.
     * @param initData Initialization data for the module.
     */
    function enableModule(address module, bytes memory initData) public authorized {
        _enableModule(module, initData);
    }

    /**
     * @notice Disables the module `module` for the Versa Wallet.
     * @dev This can only be done via a Versa Wallet transaction.
     * @param prevModule The address of the previous module in the modules linked list.
     * @param module The module to be disabled.
     */
    function disableModule(address prevModule, address module) public authorized {
        _disableModule(prevModule, module);
    }

    /**
     * @notice Checks if a module is enabled for the Versa Wallet.
     * @return True if the module is enabled, false otherwise.
     */
    function isModuleEnabled(address module) public view returns (bool) {
        return _isModuleEnabled(module);
    }

    /**
     * @notice Returns an array of modules.
     * @param start The start of the page. Must be a module or start pointer (0x1 address).
     * @param pageSize The maximum number of modules to be returned. Must be > 0.
     * @return array An array of modules.
     */
    function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory array) {
        return modules.list(start, pageSize);
    }

    function moduleSize() external view returns(uint256) {
        return modules.size();
    }

    /**
     * @dev Internal function to enable a module for the Versa Wallet.
     * @param module The module to be enabled.
     * @param initData Initialization data for the module.
     */
    function _enableModule(address module, bytes memory initData) internal {
        require(
            IModule(module).supportsInterface(type(IModule).interfaceId),
            "Not a module"
        );
        modules.add(module);
        IModule(module).initWalletConfig(initData);
        emit EnabledModule(module);
    }

    /**
     * @dev Internal function to disable a module for the Versa Wallet.
     * @param prevModule The address of the previous module in the modules linked list.
     * @param module The module to be disabled.
     */
    function _disableModule(address prevModule, address module) internal {
        modules.remove(prevModule, module);
        try IModule(module).clearWalletConfig() {
            emit DisabledModule(module);
        } catch {
            emit DisabledModuleWithError(module);
        }
    }

    /**
     * @dev Internal function to check if a module is enabled for the Versa Wallet.
     * @return True if the module is enabled, false otherwise.
     */
    function _isModuleEnabled(address module) internal view returns (bool) {
        return modules.isExist(module);
    }
}
