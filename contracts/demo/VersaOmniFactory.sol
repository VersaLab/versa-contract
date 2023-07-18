// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import "@layerzerolabs/solidity-examples/contracts/util/ExcessivelySafeCall.sol";
import "./BaseOmniApp.sol";
import "../VersaWallet.sol";

contract VersaAccountFactory is SafeProxyFactory, BaseOmniApp {
    using ExcessivelySafeCall for address;

    address public immutable versaSingleton;
    address public immutable defaultFallbackHandler;

    mapping(address wallet => bytes32 salt) internal _walletSalts;

    modifier onlySelf() {
        require(msg.sender == address(this), "VersaFactory: only self call allowed");
        _;
    }

    constructor(address _versaSingleton, address _fallbackHandler, address _lzEndpoint) BaseOmniApp(_lzEndpoint) {
        versaSingleton = _versaSingleton;
        defaultFallbackHandler = _fallbackHandler;
    }

    function getSpecificAddressWithNonce(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData,
        uint256 salt
    ) public view returns (address addr) {
        bytes32 salt2 = _getSalt2(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData,
            salt
        );
        addr = _getSpecificAddressWithNonce(salt2);
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
    ) public returns (address account) {
        bytes32 salt2 = _getSalt2(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData,
            salt
        );
        address addr = _getSpecificAddressWithNonce(salt2);
        require(addr.code.length == 0, "VersaFactory: account already exists");
        account = address(
            createChainSpecificProxyWithNonce(
                versaSingleton,
                _getInitializer(
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
        require(addr == account, "VersaFactory: account address incorrect");
        _walletSalts[account] = salt2;
    }

    function createAccountOnRemoteChain(
        uint16 dstChainId,
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData
    ) public payable {
        bytes memory payload = _getPayload(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData
        );
        _sendOmniMessage(dstChainId, payload);
    }

    function createProxyWithOmni(
        address singleton,
        bytes memory initializer,
        bytes32 salt2
    ) public onlySelf returns (SafeProxy proxy) {
        proxy = deployProxy(singleton, initializer, salt2);
        emit ProxyCreation(proxy, singleton);
    }

    function _nonblockingLzReceive(
        uint16 srcChainId,
        bytes calldata srcAddress,
        uint64 nonce,
        bytes calldata payload
    ) internal override {
        (srcChainId, nonce);
        require(address(uint160(bytes20(srcAddress))) == address(this), "VersaFactory: factory address incorrect");
        address account = address(uint160(bytes20(payload[:32])));
        require(account.code.length == 0, "VersaFactory: account already exists");
        (bool success, ) = address(this).excessivelySafeCall(gasleft(), 0, payload[64:]);
        require(success, "VersaFactory: remote create account failed");
        bytes32 salt2 = bytes32(payload[32:64]);
        _walletSalts[account] = salt2;
    }

    function _getInitializer(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData
    ) internal view returns (bytes memory initializer) {
        initializer = abi.encodeCall(
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

    function _getPayload(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData
    ) internal view returns (bytes memory payload) {
        bytes memory initializer = _getInitializer(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData
        );
        bytes32 salt2 = _walletSalts[msg.sender];
        payload = abi.encode(
            msg.sender,
            salt2,
            abi.encodeCall(this.createProxyWithOmni, (versaSingleton, initializer, salt2))
        );
    }

    function _getSalt2(
        address[] memory validators,
        bytes[] memory validatorInitData,
        VersaWallet.ValidatorType[] memory validatorType,
        address[] memory hooks,
        bytes[] memory hooksInitData,
        address[] memory modules,
        bytes[] memory moduleInitData,
        uint256 salt
    ) internal view returns (bytes32 salt2) {
        bytes memory initializer = _getInitializer(
            validators,
            validatorInitData,
            validatorType,
            hooks,
            hooksInitData,
            modules,
            moduleInitData
        );
        salt2 = keccak256(abi.encodePacked(keccak256(initializer), salt, getChainId()));
    }

    function _getSpecificAddressWithNonce(bytes32 salt2) internal view returns (address addr) {
        bytes memory deploymentData = abi.encodePacked(proxyCreationCode(), uint256(uint160(versaSingleton)));
        addr = Create2.computeAddress(bytes32(salt2), keccak256(deploymentData), address(this));
    }
}
