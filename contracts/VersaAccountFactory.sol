// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Create2.sol";
import "./proxies/VersaProxyFactory.sol";
import "./VersaWallet.sol";

/**
 * A wrapper factory contract to deploy Versa account proxy.
 */
contract VersaAccountFactory is VersaProxyFactory {
    address public immutable versaSingleton;
    address public immutable defaultFallbackHandler;

    constructor(address _versaSingleton, address _fallbackHandler) {
        versaSingleton = _versaSingleton;
        defaultFallbackHandler = _fallbackHandler;
    }

    function createAccount(
        bytes[] calldata validatorData,
        bytes[] calldata hookData,
        bytes[] calldata moduleData,
        uint256 salt
    ) public returns (address) {
        address addr = getAddress(
            validatorData,
            hookData,
            moduleData,
            salt
        );
        if (addr.code.length > 0) {
            return addr;
        }
        return
            address(
                createProxyWithNonce(
                    versaSingleton,
                    getInitializer(
                        validatorData,
                        hookData,
                        moduleData
                    ),
                    salt
                )
            );
    }

    function getInitializer(
        bytes[] calldata validatorData,
        bytes[] calldata hookData,
        bytes[] calldata moduleData
    ) internal view returns (bytes memory) {
        return
            abi.encodeCall(
                VersaWallet.initialize,
                (
                    defaultFallbackHandler,
                    validatorData,
                    hookData,
                    moduleData
                )
            );
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     * (uses the same "create2 signature" used by SafeProxyFactory.createProxyWithNonce)
     */
    function getAddress(
        bytes[] calldata validatorData,
        bytes[] calldata hookData,
        bytes[] calldata moduleData,
        uint256 salt
    ) public view returns (address) {
        bytes memory initializer = getInitializer(
            validatorData,
            hookData,
            moduleData
        );
        bytes32 salt2 = keccak256(abi.encodePacked(keccak256(initializer), salt));
        bytes memory deploymentData = abi.encodePacked(proxyCreationCode(), uint256(uint160(versaSingleton)));
        return Create2.computeAddress(bytes32(salt2), keccak256(deploymentData), address(this));
    }
}
