// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "../common/SelfAuthorized.sol";
import "../common/Enum.sol";
import "../libraries/AddressLinkedList.sol";
import "../interfaces/IHooks.sol";

/**
 * @title HooksManager
 * @dev A contract managing hooks for transaction execution in a Versa wallet.
 * @notice Hooks are wallet extensions that can be executed before and after each transaction in a Versa wallet.
 * Hooks provide additional functionality and customization options for transaction processing.
 * It is important to only enable trusted and audited hooks to prevent potential security risks.
 */
abstract contract HooksManager is SelfAuthorized {
    using AddressLinkedList for mapping(address => address);

    event EnabledHooks(address indexed hooks);
    event DisabledHooks(address indexed hooks);
    event DisabledHooksWithError(address indexed hooks);

    mapping(address => address) internal beforeTxHooks;
    mapping(address => address) internal afterTxHooks;

    /**
     * @dev Enable hooks for a versa wallet.
     * @param hooks The address of the `hooks` contract.
     * @param initData Initialization data for the `hooks` contract.
     */
    function enableHooks(address hooks, bytes memory initData) public authorized {
        _enableHooks(hooks, initData);
    }

    /**
     * @dev Disable `hooks` for a versa wallet.
     * @param prevBeforeTxHooks The address of the previous preTxHook in the linked list, will
     * be unused if the `hooks` contract doesn't have a preTxHook.
     * @param prevAfterTxHooks The address of the previous afterTxHook in the linked list.will
     * be unused if the `hooks` contract doesn't have a afterTxHook.
     * @param hooks The address of the `hooks` contract to be disabled.
     */
    function disableHooks(
        address prevBeforeTxHooks,
        address prevAfterTxHooks,
        address hooks
    ) public authorized {
        _disableHooks(prevBeforeTxHooks, prevAfterTxHooks, hooks);
    }

    /**
     * @dev Check if hooks are enabled for a versa wallet.
     * @param hooks The address of the hooks contract.
     * @return enabled True if hooks are enabled for the contract.
     */
    function isHooksEnabled(address hooks) public view returns (bool enabled) {
        bool isBeforeHookExist = beforeTxHooks.isExist(hooks);
        bool isAfterHookExist = afterTxHooks.isExist(hooks);

        if (isBeforeHookExist || isAfterHookExist) {
            uint256 hasHooks = IHooks(hooks).hasHooks();
            if (
                (uint128(hasHooks) == 1 && !isAfterHookExist)
                || ((hasHooks >> 128) == 1 && !isBeforeHookExist)
            ) {
                return false;
            }
            return true;
        }
    }

    /**
     * @dev Get a paginated array of before transaction hooks.
     * @param start The start of the page. Must be a hooks or start pointer (0x1 address).
     * @param pageSize The maximum number of hooks to be returned. Must be > 0.
     * @return array An array of hooks.
     */
    function getPreHooksPaginated(address start, uint256 pageSize) external view returns (address[] memory array) {
        return beforeTxHooks.list(start, pageSize);
    }

    /**
     * @dev Get a paginated array of after transaction hooks.
     * @param start The start of the page. Must be a hooks or start pointer (0x1 address).
     * @param pageSize The maximum number of hooks to be returned. Must be > 0.
     * @return array An array of hooks.
     */
    function getPostHooksPaginated(address start, uint256 pageSize) external view returns (address[] memory array) {
        return afterTxHooks.list(start, pageSize);
    }

    function hooksSize() external view returns(uint256 beforeTxHooksSize, uint256 afterTxHooksSize) {
        beforeTxHooksSize = beforeTxHooks.size();
        afterTxHooksSize = afterTxHooks.size();
    }

    /**
     * @dev Internal function to enable hooks for a versa wallet.
     * @param hooks The address of the hooks contract.
     * @param initData Initialization data for the hooks contract.
     */
    function _enableHooks(address hooks, bytes memory initData) internal {
        // Add hooks to linked list
        require(
            IHooks(hooks).supportsInterface(type(IHooks).interfaceId),
            "Not a valid hooks contract"
        );
        uint256 hasHooks = IHooks(hooks).hasHooks();
        if (hasHooks >> 128 == 1) {
            beforeTxHooks.add(hooks);
        }
        if (uint128(hasHooks) == 1) {
            afterTxHooks.add(hooks);
        }
        // Initialize wallet configurations
        IHooks(hooks).initWalletConfig(initData);
        emit EnabledHooks(hooks);
    }

    /**
     * @dev Internal function to disable hooks for a specific contract.
     * @param prevBeforeTxHook The previous before transaction hooks contract address in the linked list.
     * @param prevAfterTxHooks The previous after transaction hooks contract address in the linked list.
     * @param hooks The address of the hooks contract to be disabled.
     */
    function _disableHooks(address prevBeforeTxHook, address prevAfterTxHooks, address hooks) internal {
        // Remove hooks from exsiting linked list
        uint256 hasHooks = IHooks(hooks).hasHooks();
        if (hasHooks >> 128 == 1) {
            beforeTxHooks.remove(prevBeforeTxHook, hooks);
        }
        if (uint128(hasHooks) == 1) {
            afterTxHooks.remove(prevAfterTxHooks, hooks);
        }
        // Try to clear wallet configurations
        try IHooks(hooks).clearWalletConfig() {
            emit DisabledHooks(hooks);
        } catch {
            emit DisabledHooksWithError(hooks);
        }
    }

    /**
     * @dev Loop through the beforeTransactionHooks list and execute all before transaction hooks.
     * @param to The address of the transaction recipient.
     * @param value The value of the transaction.
     * @param data The data of the transaction.
     * @param operation The type of operation being performed.
     */
    function _beforeTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) internal {
        address addr = beforeTxHooks[AddressLinkedList.SENTINEL_ADDRESS];
        while (uint160(addr) > AddressLinkedList.SENTINEL_UINT) {
            {
                address hooks = addr;
                IHooks(hooks).beforeTransaction(to, value, data, operation);
            }
            addr = beforeTxHooks[addr];
        }
    }

    /**
     * @dev Loop through the afterTransactionHooks list and execute all after transaction hooks.
     * @param to The address of the transaction recipient.
     * @param value The value of the transaction.
     * @param data The data of the transaction.
     * @param operation The type of operation being performed.
     */
    function _afterTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) internal {
        address addr = afterTxHooks[AddressLinkedList.SENTINEL_ADDRESS];
        while (uint160(addr) > AddressLinkedList.SENTINEL_UINT) {
            {
                address hooks = addr;
                IHooks(hooks).afterTransaction(to, value, data, operation);
            }
            addr = afterTxHooks[addr];
        }
    }
}
