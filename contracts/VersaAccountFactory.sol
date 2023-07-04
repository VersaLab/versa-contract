// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import "./VersaWallet.sol";

/**
 * A wrapper factory contract to deploy Versa account proxy.
 */
contract VersaAccountFactory is SafeProxyFactory {
    address public immutable versaSingleton;
    address public immutable defaultFallbackHandler;

    constructor(address _versaSingleton, address _fallbackHandler) {
        versaSingleton = _versaSingleton;
        defaultFallbackHandler = _fallbackHandler;
    }

    function createAccount(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData,
        uint256 salt
    ) public returns (address) {
        address addr = getAddress(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData,
            salt
        );
        uint codeSize = addr.code.length;
        if (codeSize > 0) {
            return addr;
        }
        return
            address(
                createProxyWithNonce(
                    versaSingleton,
                    getInitializer(
                        validators,
                        validatorInitData,
                        validatorType,
                        hooks,
                        hooksInitData,
                        modules,
                        moduleInitData
                    ),
                    salt
                )
            );
    }

    function getInitializer(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData
    ) internal view returns (bytes memory) {
        return
            abi.encodeCall(
                VersaWallet.initialize,
                (
                    defaultFallbackHandler,
                    validators,
                    validatorInitData,
                    validatorType,
                    hooks,
                    hooksInitData,
                    modules,
                    moduleInitData
                )
            );
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     * (uses the same "create2 signature" used by SafeProxyFactory.createProxyWithNonce)
     */
    function getAddress(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData,
        uint256 salt
    ) public view returns (address) {
        bytes memory initializer = getInitializer(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData
        );
        //copied from deployProxyWithNonce
        bytes32 salt2 = keccak256(abi.encodePacked(keccak256(initializer), salt));
        bytes memory deploymentData = abi.encodePacked(proxyCreationCode(), uint256(uint160(versaSingleton)));
        return Create2.computeAddress(bytes32(salt2), keccak256(deploymentData), address(this));
    }
}
