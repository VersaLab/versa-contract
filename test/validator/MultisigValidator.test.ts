import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MultiSigValidator, MultiSigValidator__factory, VersaWallet } from "../../typechain-types";
import { deployVersaWallet, getUserOpHash } from "../utils";
import { enablePlugin, execute } from "../base/utils";
import { arrayify, hexConcat, hexlify, keccak256, toUtf8Bytes } from "ethers/lib/utils";
import * as helper from "@nomicfoundation/hardhat-network-helpers";
import { numberToFixedHex } from "../base/utils";

describe("MultiSigValidator", () => {
    let multisigValidator: MultiSigValidator;
    let owner: SignerWithAddress;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let signer3: SignerWithAddress;
    let abiCoder = new ethers.utils.AbiCoder();
    let wallet: VersaWallet;

    beforeEach(async () => {
        [owner, signer1, signer2, signer3] = await ethers.getSigners();
        multisigValidator = await new MultiSigValidator__factory(owner).deploy();
        wallet = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
    });

    it("should initialize correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 1]);
        let tx = await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        await expect(tx)
            .to.emit(multisigValidator, "WalletInited")
            .withArgs(wallet.address)
            .to.emit(multisigValidator, "AddGuardian")
            .withArgs(wallet.address, signer1.address)
            .to.emit(multisigValidator, "AddGuardian")
            .withArgs(wallet.address, signer2.address)
            .to.emit(multisigValidator, "ChangeThreshold")
            .withArgs(wallet.address, threshold);

        expect(await multisigValidator.isGuardian(wallet.address, signer1.address)).to.be.equal(true);
        expect(await multisigValidator.isGuardian(wallet.address, signer2.address)).to.be.equal(true);
        expect(await multisigValidator.guardiansCount(wallet.address)).to.be.equal(2);
        expect(await multisigValidator.threshold(wallet.address)).to.be.equal(threshold);
    });

    it("should add guardian correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        let data = multisigValidator.interface.encodeFunctionData("addGuardian", [signer2.address, threshold]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });
        expect(await multisigValidator.isGuardian(wallet.address, signer2.address)).to.be.equal(true);
        expect(await multisigValidator.threshold(wallet.address)).to.be.equal(threshold);
    });

    it("should add guardians correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        let data = multisigValidator.interface.encodeFunctionData("addGuardians", [
            [signer2.address, signer3.address],
            threshold,
        ]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });
        expect(await multisigValidator.isGuardian(wallet.address, signer2.address)).to.be.equal(true);
        expect(await multisigValidator.isGuardian(wallet.address, signer3.address)).to.be.equal(true);
        expect(await multisigValidator.threshold(wallet.address)).to.be.equal(threshold);
    });

    it("should revoke guardians correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        // revoke signer1
        let data = multisigValidator.interface.encodeFunctionData("revokeGuardian", [signer1.address, threshold]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });
        expect(await multisigValidator.isGuardian(wallet.address, signer1.address)).to.be.equal(false);
        expect(await multisigValidator.isGuardian(wallet.address, signer2.address)).to.be.equal(true);
        expect(await multisigValidator.threshold(wallet.address)).to.be.equal(threshold);
    });

    it("should not add invalid guardian", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        let data = multisigValidator.interface.encodeFunctionData("addGuardian", [signer1.address, threshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.rejectedWith("Guardian is already added");

        data = multisigValidator.interface.encodeFunctionData("addGuardian", [ethers.constants.AddressZero, threshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.rejectedWith("Invalid guardian address");
    });

    it("should change threshold correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        let newThreshold = 2;
        // revoke signer1
        let data = multisigValidator.interface.encodeFunctionData("changeThreshold", [newThreshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        )
            .to.emit(multisigValidator, "ChangeThreshold")
            .withArgs(wallet.address, newThreshold);
    });

    it("should not set invalid threshold or guardians", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        let newThreshold = 3;
        // revoke signer1
        let data = multisigValidator.interface.encodeFunctionData("changeThreshold", [newThreshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.revertedWith("Threshold must be lower or equal to guardians count");

        newThreshold = 0;
        // revoke signer1
        data = multisigValidator.interface.encodeFunctionData("changeThreshold", [newThreshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.revertedWith("Threshold cannot be 0");

        newThreshold = 1;
        data = multisigValidator.interface.encodeFunctionData("resetGuardians", [
            newThreshold,
            [signer1.address, signer2.address],
            [],
        ]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.revertedWith("Must have at least one guardian");
    });

    it("should approve and revoke hash", async () => {
        let sudoValidator = multisigValidator;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 1]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        let hash = keccak256(toUtf8Bytes("hello world"));
        // revoke signer1
        let data = multisigValidator.interface.encodeFunctionData("approveHash", [hash]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        )
            .to.emit(multisigValidator, "ApproveHash")
            .withArgs(hash);

        expect(await multisigValidator.isHashApproved(wallet.address, hash)).to.be.equal(true);

        data = multisigValidator.interface.encodeFunctionData("revokeHash", [hash]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        )
            .to.emit(multisigValidator, "RevokeHash")
            .withArgs(hash);

        expect(await multisigValidator.isHashApproved(wallet.address, hash)).to.be.equal(false);
    });

    it("should validate userOp signature correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 2;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
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

        let sign1 = await signer1.signMessage(arrayify(userOpHash));
        let sign2 = await signer2.signMessage(arrayify(userOpHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        // signature must be sorted, here sign2 < sign1
        let combinedSignature = hexConcat([sign2, sign1]);
        let sign = hexConcat([ethers.constants.AddressZero, "0x00", combinedSignature]);
        op.signature = sign;

        let validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(0);

        combinedSignature = hexConcat([sign1, sign2]);
        sign = hexConcat([ethers.constants.AddressZero, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        let sign3 = await signer3.signMessage(arrayify(userOpHash));
        combinedSignature = hexConcat([sign3, sign1]);
        sign = hexConcat([ethers.constants.AddressZero, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        // Signatures data too short
        sign = hexConcat([ethers.constants.AddressZero, "0x00", sign1]);
        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);
    });

    it("should validate schedualed transaction signature correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 2;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
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

        // let now = Math.floor((new Date().getTime() / 1000));
        let validAfter = 0;
        let validUntil = 0;
        let maxFeePerGas = op.maxFeePerGas;
        let maxPriorityFeePerGas = op.maxPriorityFeePerGas;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        let finalHash = keccak256(abiCoder.encode(["bytes32", "bytes"], [userOpHash, extraData]));
        console.log("final hash", finalHash);

        let userOpSigs = "0x";

        let signers = [signer1, signer2];

        signers.sort((a, b) => {
            let addressA = a.address.toLocaleLowerCase();
            let addressB = b.address.toLocaleLowerCase();
            if (addressA < addressB) {
                return -1;
            } else if (addressA == addressB) {
                return 0;
            } else {
                return 1;
            }
        });

        const promises = signers.map(async (signer) => {
            console.log("signer address", signer.address);
            const signature = await signer.signMessage(arrayify(finalHash));
            userOpSigs = hexConcat([userOpSigs, signature]);
        });
        await Promise.all(promises);
        console.log("userOpSigs", userOpSigs);

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        let sign = hexConcat([
            ethers.constants.AddressZero,
            "0x01",
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(maxFeePerGas, 32),
            numberToFixedHex(maxPriorityFeePerGas, 32),
            userOpSigs,
        ]);

        op.signature = sign;

        const validationData = await multisigValidator.validateSignature(op, userOpHash);
        const expectedValidationData = hexConcat([
            numberToFixedHex(validAfter, 6),
            numberToFixedHex(validUntil, 6),
            numberToFixedHex(0, 20),
        ]);
        expect(validationData).to.equal(expectedValidationData);
    });

    it("should validate userOp signature correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 2;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
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

        let sign1 = await signer1.signMessage(arrayify(userOpHash));
        let sign2 = await signer2.signMessage(arrayify(userOpHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        // signature must be sorted, here signer2 < signer1
        let combinedSignature = hexConcat([sign2, sign1]);
        let sign = hexConcat([ethers.constants.AddressZero, "0x00", combinedSignature]);
        op.signature = sign;

        let validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(0);

        combinedSignature = hexConcat([sign1, sign2]);
        sign = hexConcat([ethers.constants.AddressZero, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        let sign3 = await signer3.signMessage(arrayify(userOpHash));
        combinedSignature = hexConcat([sign3, sign1]);
        sign = hexConcat([ethers.constants.AddressZero, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        // Signatures data too short
        sign = hexConcat([ethers.constants.AddressZero, "0x00", sign1]);
        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);
    });

    it("should validate EIP-1271 signature correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 2;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        const message = "hello world?";
        const messageHash = keccak256(toUtf8Bytes(message));

        let sign1 = await signer1.signMessage(arrayify(messageHash));
        let sign2 = await signer2.signMessage(arrayify(messageHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        let sign = signer1 < signer2 ? hexConcat([sign1, sign2]) : hexConcat([sign2, sign1]);

        let result = await multisigValidator.isValidSignature(messageHash, sign, wallet.address);
        expect(result).to.equal(true);

        let sign3 = await signer3.signMessage(arrayify(messageHash));
        sign = signer3 < signer1 ? hexConcat([sign3, sign1]) : hexConcat([sign1, sign3]);

        await expect(multisigValidator.isValidSignature(messageHash, sign, wallet.address)).to.be.revertedWith(
            "Invalid guardian"
        );

        sign = sign1;
        await expect(multisigValidator.isValidSignature(messageHash, sign, wallet.address)).to.be.revertedWith(
            "Signatures data too short"
        );
    });

    it("should accept pre-approved hash", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 2;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        const message = "hello world?";
        const messageHash = keccak256(toUtf8Bytes(message));
        let data = multisigValidator.interface.encodeFunctionData("approveHash", [messageHash]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });

        let res = await multisigValidator.isValidSignature(messageHash, "0x", wallet.address);
        expect(res).to.be.equal(true);
    });
});
