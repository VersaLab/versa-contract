// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/**
 * @title VersaVerifyingPaymaster
 * @dev A verifying paymaster for sponsoring using ERC20 tokens.
 */
contract VersaVerifyingPaymaster is BasePaymaster {
    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20Metadata;

    enum SponsorMode {
        GAS_AND_FEE,
        GAS_ONLY,
        FREE
    }

    struct PaymasterData {
        IERC20Metadata token;
        SponsorMode mode;
        uint48 validUntil;
        uint256 fee;
        uint256 exchangeRate;
        bytes signature;
    }

    //calculated cost of the postOp
    uint256 public constant COST_OF_POST = 35000;
    mapping(IERC20Metadata => uint256) public balances;

    event UserOperationSponsored(address indexed sender, address indexed token, uint256 cost);

    constructor(IEntryPoint _entryPoint, address _owner) BasePaymaster(_entryPoint) {
        _transferOwnership(_owner);
    }

    /**
     * withdraw tokens.
     * @param _token the token deposit to withdraw
     * @param _target address to send to
     * @param _amount amount to withdraw
     */
    function withdrawTokensTo(IERC20Metadata _token, address _target, uint256 _amount) external onlyOwner {
        balances[_token] -= _amount;
        _token.safeTransfer(_target, _amount);
    }

    function pack(UserOperation calldata _userOp) internal pure returns (bytes32) {
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

    /**
     * return the hash we're going to sign off-chain (and validate on-chain)
     * this method is called by the off-chain service, to sign the request.
     * it is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * note that this signature covers all fields of the UserOperation, except the "paymasterAndData",
     * which will carry the signature itself.
     */
    function getHash(
        UserOperation calldata _userOp,
        PaymasterData memory _paymasterData
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    pack(_userOp),
                    block.chainid,
                    address(this),
                    address(_paymasterData.token),
                    _paymasterData.mode,
                    _paymasterData.validUntil,
                    _paymasterData.fee,
                    _paymasterData.exchangeRate
                )
            );
    }

    function parsePaymasterAndData(bytes calldata _paymasterAndData) public pure returns (PaymasterData memory) {
        IERC20Metadata token = IERC20Metadata(address(bytes20(_paymasterAndData[20:40])));
        SponsorMode mode = SponsorMode(uint8(bytes1(_paymasterAndData[40:41])));
        uint48 validUntil = uint48(bytes6(_paymasterAndData[41:47]));
        uint256 fee = uint256(bytes32(_paymasterAndData[47:79]));
        uint256 exchangeRate = uint256(bytes32(_paymasterAndData[79:111]));
        bytes memory signature = bytes(_paymasterAndData[111:]);
        return PaymasterData(token, mode, validUntil, fee, exchangeRate, signature);
    }

    /**
     * Verify our external signer signed this request and decode paymasterData
     * paymasterData contains the following:
     * token address length 20
     * signature length 64 or 65
     */
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        (userOpHash, maxCost);

        PaymasterData memory paymasterData = parsePaymasterAndData(userOp.paymasterAndData);
        require(paymasterData.signature.length == 65, "PM: invalid signature length in paymasterAndData");

        bytes32 _hash = getHash(userOp, paymasterData).toEthSignedMessageHash();
        if (_hash.recover(paymasterData.signature) != owner()) {
            return ("", _packValidationData(true, paymasterData.validUntil, 0));
        }

        address account = userOp.getSender();
        bytes memory _context = abi.encode(
            account,
            paymasterData.token,
            paymasterData.mode,
            paymasterData.fee,
            paymasterData.exchangeRate,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas
        );

        return (_context, _packValidationData(false, paymasterData.validUntil, 0));
    }

    /**
     * Perform the post-operation to charge the sender for the gas.
     */
    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) internal override {
        (
            address account,
            IERC20Metadata token,
            SponsorMode sponsorMode,
            uint256 fee,
            uint256 exchangeRate,
            uint256 maxFeePerGas,
            uint256 maxPriorityFeePerGas
        ) = abi.decode(context, (address, IERC20Metadata, SponsorMode, uint256, uint256, uint256, uint256));
        if (sponsorMode == SponsorMode.FREE) return;
        uint256 gasPricePostOp;
        if (maxFeePerGas == maxPriorityFeePerGas) {
            gasPricePostOp = maxFeePerGas;
        } else {
            gasPricePostOp = Math.min(maxFeePerGas, maxPriorityFeePerGas + block.basefee);
        }

        uint256 actualTokenCost = ((actualGasCost + (COST_OF_POST * gasPricePostOp)) * exchangeRate) / 1e18;
        if (sponsorMode == SponsorMode.GAS_AND_FEE) {
            actualTokenCost = actualTokenCost + fee;
        }
        if (mode != PostOpMode.postOpReverted) {
            token.safeTransferFrom(account, address(this), actualTokenCost);
            balances[token] += actualTokenCost;
            emit UserOperationSponsored(account, address(token), actualTokenCost);
        }
    }
}
