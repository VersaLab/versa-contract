import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ECDSAValidator, ECDSAValidator__factory, VersaWallet } from "../../typechain-types";
import { deployVersaWallet, getUserOpHash } from "../utils";
import { enablePlugin, execute } from "../base/utils";
import {
    arrayify,
    hexConcat,
    hexlify,
    keccak256,
    recoverAddress,
    recoverPublicKey,
    verifyMessage,
} from "ethers/lib/utils";
import * as helper from "@nomicfoundation/hardhat-network-helpers";
import { numberToFixedHex } from "../base/utils";

describe("ECDSAValidator", () => {
    let ecdsaValidator: ECDSAValidator;
    let owner: SignerWithAddress;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let abiCoder = new ethers.utils.AbiCoder();
    let wallet: VersaWallet;

    beforeEach(async () => {
        [owner, signer1, signer2] = await ethers.getSigners();
        ecdsaValidator = await new ECDSAValidator__factory(owner).deploy();
        wallet = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
    });

    it("should initialize correctly", async () => {
        let sudoValidator = ecdsaValidator;
        let initData = abiCoder.encode(["address"], [signer1.address]);

        let tx = enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        await expect(tx)
            .to.emit(ecdsaValidator, "WalletInited")
            .withArgs(wallet.address)
            .to.emit(ecdsaValidator, "SignerSet")
            .withArgs(wallet.address, ethers.constants.AddressZero, signer1.address);

        let signer = await ecdsaValidator.getSigner(wallet.address);
        expect(signer).to.be.equal(signer1.address);
    });

    it("should set signer correctly", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });

        let data = ecdsaValidator.interface.encodeFunctionData("setSigner", [signer2.address]);
        await execute({
            executor: wallet,
            to: ecdsaValidator.address,
            data,
        });

        const storedSigner = await ecdsaValidator.getSigner(wallet.address);
        expect(storedSigner).to.equal(signer2.address);
    });

    it("should fail when validator is an EOA", async () => {
        await expect(ecdsaValidator.connect(signer1).setSigner(signer1.address)).to.be.revertedWithoutReason(); // without reason because signer1 is an EOA account and doesn't have
        // `isValidatorEnabled` function
    });

    it("should fail when validator is not enabled", async () => {
        let data = ecdsaValidator.interface.encodeFunctionData("setSigner", [signer1.address]);
        await expect(
            execute({
                executor: wallet,
                to: ecdsaValidator.address,
                data,
            })
        ).to.be.revertedWith("Validator is not enabled");
    });

    it("should validate instant transaction signature correctly", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });
        let op = {
            sender: wallet.address,
            nonce: 2,
            initCode: "0x",
            callData: "0x",
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: "0x",
        };
        let entryPoint = ethers.constants.AddressZero;
        let chainId = 1;
        const userOpHash = getUserOpHash(op, entryPoint, chainId);

        let sign = await signer1.signMessage(arrayify(userOpHash));
        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([ethers.constants.AddressZero, "0x00", sign]);
        op.signature = sign;

        const validationData = await ecdsaValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(0);
    });

    it("should validate schedualed transaction signature correctly", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });
        let op = {
            sender: wallet.address,
            nonce: 2,
            initCode: "0x",
            callData: "0x",
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: "0x",
        };
        let entryPoint = ethers.constants.AddressZero;
        let chainId = 1;
        const userOpHash = getUserOpHash(op, entryPoint, chainId);

        let validAfter = await helper.time.latest();
        let validUntil = validAfter + 100;
        let maxFeePerGas = 100;
        let maxPriorityFeePerGas = 100;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        let finalHash = keccak256(abiCoder.encode(["bytes32", "bytes"], [userOpHash, extraData]));
        let sign = await signer1.signMessage(arrayify(finalHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([
            ethers.constants.AddressZero,
            "0x01",
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(maxFeePerGas, 32),
            numberToFixedHex(maxPriorityFeePerGas, 32),
            sign,
        ]);

        op.signature = sign;

        const validationData = await ecdsaValidator.validateSignature(op, userOpHash);
        const expectedValidationData = hexConcat([
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(0, 20),
        ]);
        expect(validationData).to.equal(expectedValidationData);
    });

    it("should fail validation for invalid instant tx signature", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });
        let op = {
            sender: wallet.address,
            nonce: 2,
            initCode: "0x",
            callData: "0x",
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: "0x",
        };
        let entryPoint = ethers.constants.AddressZero;
        let chainId = 1;
        const userOpHash = getUserOpHash(op, entryPoint, chainId);

        let sign = await signer2.signMessage(arrayify(userOpHash));
        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([ethers.constants.AddressZero, "0x00", sign]);
        op.signature = sign;

        const validationData = await ecdsaValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);
    });

    it("should fail validation for invalid scheduled tx signature", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });
        let op = {
            sender: wallet.address,
            nonce: 2,
            initCode: "0x",
            callData: "0x",
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: "0x",
        };
        let entryPoint = ethers.constants.AddressZero;
        let chainId = 1;
        const userOpHash = getUserOpHash(op, entryPoint, chainId);

        let validAfter = await helper.time.latest();
        let validUntil = validAfter + 100;
        let maxFeePerGas = 100;
        let maxPriorityFeePerGas = 100;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        let finalHash = keccak256(abiCoder.encode(["bytes32", "bytes"], [userOpHash, extraData]));
        let sign = await signer2.signMessage(arrayify(finalHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([
            ethers.constants.AddressZero,
            "0x01",
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(maxFeePerGas, 32),
            numberToFixedHex(maxPriorityFeePerGas, 32),
            sign,
        ]);

        op.signature = sign;

        const validationData = await ecdsaValidator.validateSignature(op, userOpHash);
        const expectedValidationData = hexConcat([
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(1, 20),
        ]);
        expect(validationData).to.equal(expectedValidationData);
    });

    it("should fail validation if actual fee exceeds signed fee", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });
        let op = {
            sender: wallet.address,
            nonce: 2,
            initCode: "0x",
            callData: "0x",
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 200,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: "0x",
        };
        let entryPoint = ethers.constants.AddressZero;
        let chainId = 1;
        const userOpHash = getUserOpHash(op, entryPoint, chainId);

        let validAfter = await helper.time.latest();
        let validUntil = validAfter + 100;
        let maxFeePerGas = 100;
        let maxPriorityFeePerGas = 100;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        let finalHash = keccak256(abiCoder.encode(["bytes32", "bytes"], [userOpHash, extraData]));
        let sign = await signer1.signMessage(arrayify(finalHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([
            ethers.constants.AddressZero,
            "0x01",
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(maxFeePerGas, 32),
            numberToFixedHex(maxPriorityFeePerGas, 32),
            sign,
        ]);

        op.signature = sign;

        const validationData = await ecdsaValidator.validateSignature(op, userOpHash);
        const expectedValidationData = 1;
        expect(validationData).to.equal(expectedValidationData);
    });

    it("should check if EIP1271 signature is valid", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });

        let utf8Encode = new TextEncoder();
        const message = utf8Encode.encode("hello world");
        const messageHash = keccak256(message);
        const signature = await signer1.signMessage(arrayify(messageHash));

        const validationData = await ecdsaValidator.isValidSignature(messageHash, signature, wallet.address);
        expect(validationData).to.equal(true);
    });

    it("should fail when checking an invalid EIP1271 signature", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });

        let utf8Encode = new TextEncoder();
        const message = utf8Encode.encode("hello world");
        const messageHash = keccak256(arrayify(message));
        const signature = await signer2.signMessage(messageHash);

        const validationData = await ecdsaValidator.isValidSignature(messageHash, signature, wallet.address);
        expect(validationData).to.equal(false);
    });
});
