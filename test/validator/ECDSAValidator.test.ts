import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ECDSAValidator, ECDSAValidator__factory, MockValidator__factory, VersaWallet } from "../../typechain-types";
import { deployVersaWallet, getUserOpHash, getScheduledUserOpHash, entryPointAddress } from "../utils";
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
    let wallet_2: VersaWallet;

    beforeEach(async () => {
        [owner, signer1, signer2] = await ethers.getSigners();
        ecdsaValidator = await new ECDSAValidator__factory(owner).deploy();
        wallet = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
        wallet_2 = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
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

        expect(await ecdsaValidator.isWalletInited(wallet.address)).to.be.equal(true);

        await wallet
            .connect(owner)
            .sudoExecute(
                ecdsaValidator.address,
                0,
                ecdsaValidator.interface.encodeFunctionData("initWalletConfig", [owner.address]),
                0
            );

        await expect(
            wallet_2
                .connect(owner)
                .sudoExecute(
                    ecdsaValidator.address,
                    0,
                    ecdsaValidator.interface.encodeFunctionData("initWalletConfig", [owner.address]),
                    0
                )
        ).to.be.revertedWith("E500");

        await expect(
            wallet_2
                .connect(owner)
                .sudoExecute(
                    ecdsaValidator.address,
                    0,
                    ecdsaValidator.interface.encodeFunctionData("clearWalletConfig"),
                    0
                )
        ).to.be.revertedWith("E500");

        await wallet
            .connect(owner)
            .sudoExecute(
                ecdsaValidator.address,
                0,
                ecdsaValidator.interface.encodeFunctionData("clearWalletConfig"),
                0
            );

        // can still able to call
        await wallet
            .connect(owner)
            .sudoExecute(
                ecdsaValidator.address,
                0,
                ecdsaValidator.interface.encodeFunctionData("clearWalletConfig"),
                0
            );

        expect(await ecdsaValidator.isWalletInited(wallet.address)).to.be.equal(true);
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

    it("should not set invalid signer", async () => {
        let initData = abiCoder.encode(["address"], [ethers.constants.AddressZero]);
        await expect(
            enablePlugin({
                executor: wallet,
                plugin: ecdsaValidator.address,
                initData,
                selector: "enableValidator",
            })
        ).to.be.revertedWith("E501");
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
        ).to.be.revertedWith("E500");
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

        let sign = await signer1.signMessage(
            arrayify(keccak256(abiCoder.encode(["bytes32", "address"], [userOpHash, ecdsaValidator.address])))
        );
        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([ecdsaValidator.address, "0x00", sign]);
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
        let chainId = 31337;
        let userOpHash = getScheduledUserOpHash(op, entryPointAddress, chainId);

        let validAfter = await helper.time.latest();
        let validUntil = validAfter + 100;
        let maxFeePerGas = 100;
        let maxPriorityFeePerGas = 100;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        let finalHash = keccak256(
            abiCoder.encode(["bytes32", "address", "bytes"], [userOpHash, ecdsaValidator.address, extraData])
        );
        let sign = await signer1.signMessage(arrayify(finalHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        sign = hexConcat([
            ecdsaValidator.address,
            "0x01",
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(maxFeePerGas, 32),
            numberToFixedHex(maxPriorityFeePerGas, 32),
            sign,
        ]);

        op.signature = sign;
        op.maxFeePerGas = 99;
        op.maxPriorityFeePerGas = 99;

        const validationData = await ecdsaValidator.validateSignature(op, userOpHash);
        const expectedValidationData = hexConcat([
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(0, 20),
        ]);
        expect(validationData).to.equal(expectedValidationData);
    });

    it("should reject invalid signature type", async () => {
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
        sign = hexConcat([ethers.constants.AddressZero, "0x03", sign]);
        op.signature = sign;

        await expect(ecdsaValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E202");
    });

    it("should fail for invalid signature length", async () => {
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
        sign = hexConcat([ethers.constants.AddressZero, "0x00", sign.slice(0, 6)]);
        op.signature = sign;

        await expect(ecdsaValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E203");

        sign = hexConcat([ethers.constants.AddressZero, "0x01", sign.slice(0, 6)]);
        op.signature = sign;
        // revert without reason as it fails at signature handler
        await expect(ecdsaValidator.validateSignature(op, userOpHash)).to.be.reverted;
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
        let userOpHash = getUserOpHash(op, entryPoint, chainId);

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

        await expect(ecdsaValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E201");

        op.maxFeePerGas = 100;
        op.maxPriorityFeePerGas = 200;
        userOpHash = getUserOpHash(op, entryPoint, chainId);

        finalHash = keccak256(abiCoder.encode(["bytes32", "bytes"], [userOpHash, extraData]));
        sign = await signer1.signMessage(arrayify(finalHash));

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

        await expect(ecdsaValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E201");
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

    it("should be able to verify typed data signature", async () => {
        let initData = abiCoder.encode(["address"], [signer1.address]);
        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            initData,
            selector: "enableValidator",
        });

        const domain = {
            name: "My App",
            version: "1",
            chainId: 1,
            verifyingContract: "0x1111111111111111111111111111111111111111",
        };

        const types = {
            Mail: [
                { name: "from", type: "Person" },
                { name: "to", type: "Person" },
                { name: "content", type: "string" },
            ],
            Person: [
                { name: "name", type: "string" },
                { name: "wallet", type: "address" },
            ],
        };

        const mail = {
            from: {
                name: "Alice",
                wallet: "0x2111111111111111111111111111111111111111",
            },
            to: {
                name: "Bob",
                wallet: "0x3111111111111111111111111111111111111111",
            },
            content: "Hello!",
        };

        const signature = await signer1._signTypedData(domain, types, mail);

        const expectedsSigner = ethers.utils.verifyTypedData(domain, types, mail, signature);
        expect(expectedsSigner).to.equal(signer1.address);

        const typedHash = ethers.utils._TypedDataEncoder.hash(domain, types, mail);

        const validationData = await ecdsaValidator.isValidSignature(typedHash, signature, wallet.address);
        expect(validationData).to.equal(true);

        // should reject invalid typed data signature
        const signature2 = await signer2._signTypedData(domain, types, mail);
        const typedHash2 = ethers.utils._TypedDataEncoder.hash(domain, types, mail);

        const validationData2 = await ecdsaValidator.isValidSignature(typedHash2, signature2, wallet.address);
        expect(validationData2).to.equal(false);
    });
});
