// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "../common/SelfAuthorized.sol";
import "../common/Enum.sol";
import "../common/Executor.sol";
import "../libraries/AddressLinkedList.sol";
import "../interfaces/IHooks.sol";

abstract contract HookManager is SelfAuthorized, Executor {
    using AddressLinkedList for mapping(address => address);

    event EnabledHooks(address indexed hooks);
    event DisabledHooks(address indexed hooks);
    event DisabledHooksWithError(address indexed hooks);

    mapping(address => address) internal beforeTxHooks;
    mapping(address => address) internal afterTxHooks;

    ///@dev If the `Hooks` has before transaction hook or after transaction hook,
    ///        add the needed hooks to linked list
    function enbaleHooks(address hooks, bytes calldata initData) public authorized {
        _enableHooks(hooks, initData);
    }

    ///@dev If the `Hooks` has before transaction hook or after transaction hook,
    ///        remove the existing hooks from linked list
    function disableHooks(address prevBeforeTxHooks, address prevAfterTxHooks, address hooks) public authorized {
        _disableHooks(prevBeforeTxHooks, prevAfterTxHooks, hooks);
    }

    /**
     * @notice Returns if an module is enabled
     * @return enabled True if the module is enabled
     */
    function isHooksEnabled(address hooks) public view returns (bool) {
        uint256 hasHooks = IHooks(hooks).hasHooks();
        if (
            !beforeTxHooks.isExist(hooks) && !afterTxHooks.isExist(hooks)
            || uint128(hasHooks) == 1 && !afterTxHooks.isExist(hooks)
            || (hasHooks >> 128) == 1 && !beforeTxHooks.isExist(hooks)
        ) {
            return false;
        }
        return true;
    }

    /**
     * @notice Returns an array of pre tx hooks.
     * @param start Start of the page. Has to be a hooks or start pointer (0x1 address)
     * @param pageSize Maximum number of hooks that should be returned. Has to be > 0
     * @return array Array of hooks.
     */
    function getPreHooksPaginated(address start, uint256 pageSize) external view returns (address[] memory array) {
        return beforeTxHooks.list(start, pageSize);
    }

    /**
     * @notice Returns an array of post tx hooks.
     * @param start Start of the page. Has to be a hooks or start pointer (0x1 address)
     * @param pageSize Maximum number of hooks that should be returned. Has to be > 0
     * @return array Array of hooks.
     */
    function getPostHooksPaginated(address start, uint256 pageSize) external view returns (address[] memory array) {
        return afterTxHooks.list(start, pageSize);
    }

    function _enableHooks(address hooks, bytes calldata initData) internal {
        // Add hooks to linked list
        require(
            IHooks(hooks).supportsInterface(type(IHooks).interfaceId),
            "Not a hooks hooks"
        );
        uint256 hasHooks = IHooks(hooks).hasHooks();
        if (hasHooks >> 128 == 1) {
            beforeTxHooks.add(hooks);
        }
        if (uint128(hasHooks) == 1) {
            afterTxHooks.add(hooks);
        }
        // Init wallet configs
        IHooks(hooks).initWalletConfig(initData);
        emit EnabledHooks(hooks);
    }

    function _disableHooks(address prevBeforeTxHook, address prevAfterTxHooks, address hooks) internal {
        uint256 hasHooks = IHooks(hooks).hasHooks();
        if (hasHooks >> 128 == 1) {
            beforeTxHooks.remove(prevBeforeTxHook, hooks);
        }
        if (uint128(hasHooks) == 1) {
            afterTxHooks.remove(prevAfterTxHooks, hooks);
        }
        // Try clearing wallet configs
        try IHooks(hooks).clearWalletConfig() {
            emit DisabledHooks(hooks);
        } catch {
            emit DisabledHooksWithError(hooks);
        }
    }

    ///@dev Loop the beforeTransactionHooks list and execute all before transaction hooks
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

    ///@dev Loop the afterTransactionHooks list and execute all after transaction hooks
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
