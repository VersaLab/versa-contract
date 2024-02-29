// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@aa-template/contracts/core/BasePaymaster.sol";
import "@aa-template/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./TokenSwapHandler.sol";

/**
 * @title VersaUniversalPaymaster
 * @dev A universal paymaster for sponsoring.
 */
contract VersaUniversalPaymaster is BasePaymaster, TokenSwapHandler {
    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20;

    enum SponsorMode {
        FREE_PRIVILEGE,
        PAY_WITH_TOKEN,
        MULTI_CHAIN_UNIVERSAL
    }

    enum UniversalSponsorStatus {
        UNPAID,
        PAID_UNSPONSORED,
        PAID_SPONSORED
    }

    struct FreePrivilegeModeData {
        uint48 validUntil;
        bytes signature;
    }

    struct PayWithTokenModeData {
        uint48 validUntil;
        IERC20 token;
        uint256 exchangeRate;
        bytes signature;
    }

    struct MultiChainUniversalModePaymentData {
        uint48 validUntil;
        IERC20 token;
        uint256 value;
        bytes32 sponsorInfoHash;
        bytes signature;
    }

    struct MultiChainUniversalModeSponsorStatusData {
        UniversalSponsorStatus status;
        uint48 updateAt;
    }

    struct MultiChainUniversalModeData {
        uint48 validUntil;
        bytes32 sponsorInfoHash;
        bytes signature;
    }

    event FreePrivilegeSponsored(address indexed sender, uint256 cost);
    event PayWithTokenSponsored(address indexed sender, uint256 cost);
    event MultiChainUniversalPrePaid(
        address indexed sender,
        address indexed token,
        uint256 value,
        bytes32 sponsorInfoHash
    );
    event MultiChainUniversalSponsored(address indexed sender, bytes32 sponsorInfoHash, uint256 cost);

    event OperatorSet(address indexed oldOperator, address indexed newOperator);

    address private _operator;

    uint256 public constant COST_OF_POST = 35000;
    mapping(bytes32 => MultiChainUniversalModeSponsorStatusData) public universalSponsorStatusData;

    modifier onlyOperator() {
        require(msg.sender == operator(), "VersaUniversaPaymaster: Only operator");
        _;
    }

    constructor(
        IEntryPoint _entryPoint,
        address _owner,
        address _newOperator,
        address _v2SwapRouter02,
        address _v3SwapRouter02,
        IWETH _weth
    ) BasePaymaster(_entryPoint) TokenSwapHandler(_v2SwapRouter02, _v3SwapRouter02, _weth) {
        _transferOwnership(_owner);
        _setOperator(_newOperator);
    }

    function operator() public view returns (address) {
        return _operator;
    }

    function _setOperator(address _newOperator) internal {
        address oldOperator = operator();
        _operator = _newOperator;
        emit OperatorSet(oldOperator, _newOperator);
    }

    function packUserOpData(UserOperation calldata _userOp) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _userOp.sender,
                    _userOp.nonce,
                    keccak256(_userOp.initCode),
                    keccak256(_userOp.callData),
                    _userOp.callGasLimit,
                    _userOp.verificationGasLimit,
                    _userOp.preVerificationGas,
                    _userOp.maxFeePerGas,
                    _userOp.maxPriorityFeePerGas
                )
            );
    }

    function getFreePrivilegeModeHash(
        UserOperation calldata _userOp,
        FreePrivilegeModeData memory _freePrivilegeModeData
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(packUserOpData(_userOp), block.chainid, address(this), _freePrivilegeModeData.validUntil)
            );
    }

    function parseFreePrivilegeModeData(
        bytes calldata _paymasterAndData
    ) public pure returns (FreePrivilegeModeData memory) {
        uint48 validUntil = uint48(bytes6(_paymasterAndData[21:27]));
        bytes memory signature = bytes(_paymasterAndData[27:]);
        return FreePrivilegeModeData(validUntil, signature);
    }

    function getPayWithTokenModeHash(
        UserOperation calldata _userOp,
        PayWithTokenModeData memory _payWithTokenModeData
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    packUserOpData(_userOp),
                    block.chainid,
                    address(this),
                    _payWithTokenModeData.validUntil,
                    address(_payWithTokenModeData.token),
                    _payWithTokenModeData.exchangeRate
                )
            );
    }

    function parsePayWithTokenModeData(
        bytes calldata _paymasterAndData
    ) public pure returns (PayWithTokenModeData memory) {
        uint48 validUntil = uint48(bytes6(_paymasterAndData[21:27]));
        IERC20 token = IERC20(address(bytes20(_paymasterAndData[27:47])));
        uint256 exchangeRate = uint256(bytes32(_paymasterAndData[47:79]));
        bytes memory signature = bytes(_paymasterAndData[79:]);
        return PayWithTokenModeData(validUntil, token, exchangeRate, signature);
    }

    function getMultiChainUniversalModeSponsorInfoHash(
        UserOperation[] calldata _userOps,
        uint256[] memory _chainIds
    ) public view returns (bytes32) {
        require(
            _userOps.length > 0 && _chainIds.length > 0 && _userOps.length == _chainIds.length,
            "VersaUniversaPaymaster: params length dismatch"
        );
        uint256 dataLength = _userOps.length;
        bytes32 packDataHash;
        for (uint256 i = 0; i < dataLength; ++i) {
            packDataHash = keccak256(abi.encode(packDataHash, packUserOpData(_userOps[i]), _chainIds[i]));
        }
        return keccak256(abi.encode(packDataHash, address(this)));
    }

    function getMultiChainUniversalModePaymentHash(
        MultiChainUniversalModePaymentData memory _multiChainUniversalModePaymentData
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    _multiChainUniversalModePaymentData.validUntil,
                    address(_multiChainUniversalModePaymentData.token),
                    _multiChainUniversalModePaymentData.value,
                    _multiChainUniversalModePaymentData.sponsorInfoHash
                )
            );
    }

    function parseMultiChainUniversalModePaymentData(
        bytes calldata _paymentData
    ) public pure returns (MultiChainUniversalModePaymentData memory) {
        uint48 validUntil = uint48(bytes6(_paymentData[:6]));
        IERC20 token = IERC20(address(bytes20(_paymentData[6:26])));
        uint256 value = uint256(bytes32(_paymentData[26:58]));
        bytes32 sponsorInfoHash = bytes32(_paymentData[58:90]);
        bytes memory signature = bytes(_paymentData[90:]);
        return MultiChainUniversalModePaymentData(validUntil, token, value, sponsorInfoHash, signature);
    }

    function _validateMultiChainUniversalModePaymentSignature(
        MultiChainUniversalModePaymentData memory _multiChainUniversalModePaymentData
    ) internal view returns (bool) {
        require(_multiChainUniversalModePaymentData.signature.length == 65, "E203");
        bytes32 _hash = getMultiChainUniversalModePaymentHash(_multiChainUniversalModePaymentData)
            .toEthSignedMessageHash();
        if (_hash.recover(_multiChainUniversalModePaymentData.signature) != operator()) {
            return false;
        }
        return true;
    }

    function prePayForMultiChainUniversalModeSponsor(bytes calldata _paymentData) external payable {
        MultiChainUniversalModePaymentData
            memory multiChainUniversalModePaymentData = parseMultiChainUniversalModePaymentData(_paymentData);
        require(
            universalSponsorStatusData[multiChainUniversalModePaymentData.sponsorInfoHash].status ==
                UniversalSponsorStatus.UNPAID,
            "VersaUniversalPaymaster: paid"
        );
        require(
            multiChainUniversalModePaymentData.validUntil >= block.timestamp,
            "VersaUniversalPaymaster: request expired"
        );
        require(
            _validateMultiChainUniversalModePaymentSignature(multiChainUniversalModePaymentData),
            "VersaUniversalPaymaster: validate signature failed"
        );
        if (address(multiChainUniversalModePaymentData.token) != address(0)) {
            multiChainUniversalModePaymentData.token.safeTransferFrom(
                msg.sender,
                address(this),
                multiChainUniversalModePaymentData.value
            );
        } else {
            require(
                msg.value == multiChainUniversalModePaymentData.value,
                "VersaUniversalPaymaster: payment value mismatch"
            );
        }
        universalSponsorStatusData[
            multiChainUniversalModePaymentData.sponsorInfoHash
        ] = MultiChainUniversalModeSponsorStatusData(UniversalSponsorStatus.PAID_UNSPONSORED, uint48(block.timestamp));
        emit MultiChainUniversalPrePaid(
            msg.sender,
            address(multiChainUniversalModePaymentData.token),
            multiChainUniversalModePaymentData.value,
            multiChainUniversalModePaymentData.sponsorInfoHash
        );
    }

    function getMultiChainUniversalModeHash(
        UserOperation calldata _userOp,
        MultiChainUniversalModeData memory _multiChainUniversalModeData
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    packUserOpData(_userOp),
                    block.chainid,
                    address(this),
                    _multiChainUniversalModeData.validUntil,
                    _multiChainUniversalModeData.sponsorInfoHash
                )
            );
    }

    function parseMultiChainUniversalModeData(
        bytes calldata _paymasterAndData
    ) public pure returns (MultiChainUniversalModeData memory) {
        uint48 validUntil = uint48(bytes6(_paymasterAndData[21:27]));
        bytes32 sponsorInfoHash = bytes32(_paymasterAndData[27:59]);
        bytes memory signature = bytes(_paymasterAndData[59:]);
        return MultiChainUniversalModeData(validUntil, sponsorInfoHash, signature);
    }

    function _validateSignature(UserOperation calldata userOp, SponsorMode sponsorMode) internal view returns (bool) {
        bytes memory signature;
        bytes32 _hash;
        if (sponsorMode == SponsorMode.FREE_PRIVILEGE) {
            FreePrivilegeModeData memory freePrivilegeModeData = parseFreePrivilegeModeData(userOp.paymasterAndData);
            signature = freePrivilegeModeData.signature;
            _hash = getFreePrivilegeModeHash(userOp, freePrivilegeModeData).toEthSignedMessageHash();
        } else if (sponsorMode == SponsorMode.PAY_WITH_TOKEN) {
            PayWithTokenModeData memory payWithTokenModeData = parsePayWithTokenModeData(userOp.paymasterAndData);
            signature = payWithTokenModeData.signature;
            _hash = getPayWithTokenModeHash(userOp, payWithTokenModeData).toEthSignedMessageHash();
        } else if (sponsorMode == SponsorMode.MULTI_CHAIN_UNIVERSAL) {
            MultiChainUniversalModeData memory multiChainUniversalModeData = parseMultiChainUniversalModeData(
                userOp.paymasterAndData
            );
            signature = multiChainUniversalModeData.signature;
            _hash = getMultiChainUniversalModeHash(userOp, multiChainUniversalModeData).toEthSignedMessageHash();
        } else {
            return false;
        }
        require(signature.length == 65, "E203");
        if (_hash.recover(signature) != operator()) {
            return false;
        }
        return true;
    }

    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        (userOpHash, maxCost);

        SponsorMode sponsorMode = SponsorMode(uint8(bytes1(userOp.paymasterAndData[20:21])));
        if (!_validateSignature(userOp, sponsorMode)) {
            return ("", _packValidationData(true, 0, 0));
        }
        address sender = userOp.getSender();

        if (sponsorMode == SponsorMode.FREE_PRIVILEGE) {
            FreePrivilegeModeData memory freePrivilegeModeData = parseFreePrivilegeModeData(userOp.paymasterAndData);
            context = abi.encode(sponsorMode, sender);
            validationData = _packValidationData(false, freePrivilegeModeData.validUntil, 0);
        } else if (sponsorMode == SponsorMode.PAY_WITH_TOKEN) {
            PayWithTokenModeData memory payWithTokenModeData = parsePayWithTokenModeData(userOp.paymasterAndData);
            context = abi.encode(
                sponsorMode,
                sender,
                payWithTokenModeData.token,
                payWithTokenModeData.exchangeRate,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas
            );
            validationData = _packValidationData(false, payWithTokenModeData.validUntil, 0);
        } else if (sponsorMode == SponsorMode.MULTI_CHAIN_UNIVERSAL) {
            MultiChainUniversalModeData memory multiChainUniversalModeData = parseMultiChainUniversalModeData(
                userOp.paymasterAndData
            );
            context = abi.encode(sponsorMode, sender, multiChainUniversalModeData.sponsorInfoHash);
            validationData = _packValidationData(false, multiChainUniversalModeData.validUntil, 0);
        } else {
            return ("", _packValidationData(true, 0, 0));
        }
    }

    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) internal override {
        (mode);

        SponsorMode sponsorMode = SponsorMode(uint8(bytes1(context[31:32])));
        address sender = address(bytes20(context[44:64]));
        if (sponsorMode == SponsorMode.FREE_PRIVILEGE) {
            emit FreePrivilegeSponsored(sender, actualGasCost);
        } else if (sponsorMode == SponsorMode.PAY_WITH_TOKEN) {
            (, , IERC20 token, uint256 exchangeRate, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas) = abi.decode(
                context,
                (SponsorMode, address, IERC20, uint256, uint256, uint256)
            );
            uint256 gasPricePostOp;
            if (maxFeePerGas == maxPriorityFeePerGas) {
                gasPricePostOp = maxFeePerGas;
            } else {
                gasPricePostOp = Math.min(maxFeePerGas, maxPriorityFeePerGas + block.basefee);
            }
            uint256 actualTokenCost = ((actualGasCost + (COST_OF_POST * gasPricePostOp)) * exchangeRate) / 1e18;
            token.safeTransferFrom(sender, address(this), actualTokenCost);
            emit PayWithTokenSponsored(sender, actualGasCost);
        } else if (sponsorMode == SponsorMode.MULTI_CHAIN_UNIVERSAL) {
            (, , bytes32 sponsorInfoHash) = abi.decode(context, (SponsorMode, address, bytes32));
            universalSponsorStatusData[sponsorInfoHash] = MultiChainUniversalModeSponsorStatusData(
                UniversalSponsorStatus.PAID_SPONSORED,
                uint48(block.timestamp)
            );
            emit MultiChainUniversalSponsored(sender, sponsorInfoHash, actualGasCost);
        } else {
            revert();
        }
    }

    function setOperator(address newOperator) external onlyOwner {
        _setOperator(newOperator);
    }

    struct TokenWithdrawInfo {
        IERC20 token;
        uint256 amount;
    }

    function _withdraw(TokenWithdrawInfo calldata _tokenWithdrawInfo, address _target) internal {
        if (address(_tokenWithdrawInfo.token) != address(0)) {
            _tokenWithdrawInfo.token.safeTransfer(_target, _tokenWithdrawInfo.amount);
        } else {
            payable(_target).transfer(_tokenWithdrawInfo.amount);
        }
    }

    function withdrawTokensTo(TokenWithdrawInfo calldata _tokenWithdrawInfo, address _target) external onlyOwner {
        _withdraw(_tokenWithdrawInfo, _target);
    }

    function batchWithdrawTokensTo(
        TokenWithdrawInfo[] calldata _tokenWithdrawInfo,
        address _target
    ) external onlyOwner {
        for (uint256 i = 0; i < _tokenWithdrawInfo.length; ++i) {
            _withdraw(_tokenWithdrawInfo[i], _target);
        }
    }

    function setSwapRouter(address _v2SwapRouter02, address _v3SwapRouter02) external onlyOwner {
        _setSwapRouter(_v2SwapRouter02, _v3SwapRouter02);
    }

    function approveRouter(IERC20[] calldata tokens, uint256[] calldata amount) external onlyOperator {
        _approveRouter(tokens, amount);
    }

    function convertTokensAndDeposit(
        V2SwapParas[] memory _v2SwapParas,
        V3SwapParas[] calldata _v3SwapParas
    ) external onlyOperator returns (uint256 deposited) {
        uint256 i;
        uint256 ethOut;
        for (; i < _v2SwapParas.length; ++i) {
            ethOut += _convert(_v2SwapParas[i]);
        }

        uint256 wethOut;
        for (i = 0; i < _v3SwapParas.length; ++i) {
            wethOut += _convert(_v3SwapParas[i]);
        }
        WETH.withdraw(wethOut);
        deposited = ethOut + wethOut;
        this.deposit{ value: deposited }();
    }

    receive() external payable {}
}
