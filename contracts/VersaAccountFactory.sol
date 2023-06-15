// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import "./VersaWallet.sol";

/**
 * A wrapper factory contract to deploy Safe as an ERC-4337 account contract.
 */
contract VersaAccountFactory {
    SafeProxyFactory public immutable proxyFactory;
    address public immutable versaSingleton;
    address public immutable defaultFallbackHandler;
    address public immutable defaultSudoValidator;

    constructor(
        SafeProxyFactory _proxyFactory,
        address _versaSingleton,
        address _fallbackHandler,
        address _defaultSudoValidator
    ) {
        proxyFactory = _proxyFactory;
        versaSingleton = _versaSingleton;
        defaultFallbackHandler = _fallbackHandler;
        defaultSudoValidator = _defaultSudoValidator;
    }

    function createAccount(bytes memory _validatorInitData, uint256 salt) public returns (address) {
        address addr = getAddress(_validatorInitData, salt);
        uint codeSize = addr.code.length;
        if (codeSize > 0) {
            return addr;
        }
        return address(proxyFactory.createProxyWithNonce(
                versaSingleton, getInitializer(_validatorInitData), salt));
    }

    function getInitializer(bytes memory _validatorInitData) internal view returns (bytes memory) {
        address[] memory validators = new address[](1);
        validators[0] = defaultSudoValidator;

        bytes[] memory validatorInitData = new bytes[](1);
        validatorInitData[0] = _validatorInitData;

        ValidatorManager.ValidatorType[] memory validatorType =
            new ValidatorManager.ValidatorType[](1);
        validatorType[0] = ValidatorManager.ValidatorType.Sudo;

        return abi.encodeCall(
            VersaWallet.initialize,
            (
            defaultFallbackHandler,
            validators, validatorInitData, validatorType,
            new address[](0), new bytes[](0),   // hooks, hooksInitData
            new address[](0), new bytes[](0)    // modules, moduleInitData
            )
        );
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     * (uses the same "create2 signature" used by SafeProxyFactory.createProxyWithNonce)
     */
    function getAddress(bytes memory _validatorInitData, uint256 salt) public view returns (address) {
        bytes memory initializer = getInitializer(_validatorInitData);
        //copied from deployProxyWithNonce
        bytes32 salt2 = keccak256(abi.encodePacked(keccak256(initializer), salt));
        bytes memory deploymentData = abi.encodePacked(proxyFactory.proxyCreationCode(), uint256(uint160(versaSingleton)));
        return Create2.computeAddress(bytes32(salt2), keccak256(deploymentData), address (proxyFactory));
    }
}
