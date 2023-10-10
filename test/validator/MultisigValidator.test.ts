import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    ECDSAValidator,
    ECDSAValidator__factory,
    MultiSigValidator,
    MultiSigValidator__factory,
    VersaWallet,
} from "../../typechain-types";
import { deployVersaWallet, getScheduledUserOpHash, getUserOpHash, entryPointAddress } from "../utils";
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
    let wallet_2: VersaWallet;
    let contractGuardian: ECDSAValidator;

    beforeEach(async () => {
        [owner, signer1, signer2, signer3] = await ethers.getSigners();
        multisigValidator = await new MultiSigValidator__factory(owner).deploy();
        contractGuardian = await new ECDSAValidator__factory(owner).deploy();
        wallet = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
        wallet_2 = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
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

    it("should reject invalid initdata", async () => {
        let sudoValidator = multisigValidator;
        let initData = abiCoder.encode(["address[]", "uint256"], [[], 1]);
        await expect(
            enablePlugin({
                executor: wallet,
                plugin: sudoValidator.address,
                initData,
                selector: "enableValidator",
            })
        ).to.be.revertedWith("E000");

        initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 3]);
        await expect(
            enablePlugin({
                executor: wallet,
                plugin: sudoValidator.address,
                initData,
                selector: "enableValidator",
            })
        ).to.be.revertedWith("E000");
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

        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");
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

        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");
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

        let data = multisigValidator.interface.encodeFunctionData("revokeGuardian", [signer3.address, threshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E507");

        // revoke signer1
        data = multisigValidator.interface.encodeFunctionData("revokeGuardian", [signer1.address, threshold]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });
        expect(await multisigValidator.isGuardian(wallet.address, signer1.address)).to.be.equal(false);
        expect(await multisigValidator.isGuardian(wallet.address, signer2.address)).to.be.equal(true);
        expect(await multisigValidator.threshold(wallet.address)).to.be.equal(threshold);

        data = multisigValidator.interface.encodeFunctionData("revokeGuardian", [signer2.address, threshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E502");

        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");
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
        ).to.be.rejectedWith("E505");

        data = multisigValidator.interface.encodeFunctionData("addGuardian", [ethers.constants.AddressZero, threshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.rejectedWith("E506");
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

        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");
    });

    it("should reset guardian correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        // revoke signer1
        let data = multisigValidator.interface.encodeFunctionData("resetGuardians", [
            1,
            [signer1.address],
            [signer2.address],
        ]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });
        expect(await multisigValidator.isGuardian(wallet.address, signer1.address)).to.be.equal(false);
        expect(await multisigValidator.isGuardian(wallet.address, signer2.address)).to.be.equal(true);

        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");
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
        ).to.be.revertedWith("E509");

        newThreshold = 0;
        // revoke signer1
        data = multisigValidator.interface.encodeFunctionData("changeThreshold", [newThreshold]);
        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.be.revertedWith("E508");

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
        ).to.be.revertedWith("E502");
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

        await expect(
            execute({
                executor: wallet,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E503");

        expect(await multisigValidator.isHashApproved(wallet.address, hash)).to.be.equal(true);
        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");

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

        await expect(
            execute({
                executor: wallet_2,
                to: multisigValidator.address,
                data,
            })
        ).to.revertedWith("E500");
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
        let sign1 = await signer1.signMessage(
            arrayify(keccak256(abiCoder.encode(["bytes32", "address"], [userOpHash, multisigValidator.address])))
        );
        let sign2 = await signer2.signMessage(
            arrayify(keccak256(abiCoder.encode(["bytes32", "address"], [userOpHash, multisigValidator.address])))
        );

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        // signature must be sorted, here sign2 < sign1
        let combinedSignature = hexConcat([sign2, sign1]);
        let sign = hexConcat([multisigValidator.address, "0x00", combinedSignature]);
        op.signature = sign;

        let validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(0);

        // un-ordered siganture
        combinedSignature = hexConcat([sign1, sign2]);
        sign = hexConcat([multisigValidator.address, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        // invalid guardian signature
        let sign3 = await signer3.signMessage(arrayify(userOpHash));
        combinedSignature = hexConcat([sign3, sign1]);
        sign = hexConcat([multisigValidator.address, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        // Signatures data too short
        sign = hexConcat([multisigValidator.address, "0x00", sign1]);
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
        let chainId = 31337;
        const userOpHash = getScheduledUserOpHash(op, entryPointAddress, chainId);

        let validAfter = 0;
        let validUntil = 0;
        let maxFeePerGas = op.maxFeePerGas;
        let maxPriorityFeePerGas = op.maxPriorityFeePerGas;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        let finalHash = keccak256(
            abiCoder.encode(["bytes32", "address", "bytes"], [userOpHash, multisigValidator.address, extraData])
        );

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
            const signature = await signer.signMessage(arrayify(finalHash));
            userOpSigs = hexConcat([userOpSigs, signature]);
        });
        await Promise.all(promises);

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        let sign = hexConcat([
            multisigValidator.address,
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
        let userOpHash = getUserOpHash(op, entryPoint, chainId);
        let finalHash = keccak256(abiCoder.encode(["bytes32", "address"], [userOpHash, multisigValidator.address]));

        let sign1 = await signer1.signMessage(arrayify(finalHash));
        let sign2 = await signer2.signMessage(arrayify(finalHash));

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        // signature must be sorted, here signer2 < signer1
        let combinedSignature = hexConcat([sign2, sign1]);
        let sign = hexConcat([multisigValidator.address, "0x00", combinedSignature]);
        op.signature = sign;

        let validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(0);

        // invalid sig type
        sign = hexConcat([multisigValidator.address, "0x03", combinedSignature]);
        op.signature = sign;

        await expect(multisigValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E202");

        // signature must be ordered
        combinedSignature = hexConcat([sign1, sign2]);
        sign = hexConcat([multisigValidator.address, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        let sign3 = await signer3.signMessage(arrayify(userOpHash));
        combinedSignature = hexConcat([sign3, sign1]);
        sign = hexConcat([multisigValidator.address, "0x00", combinedSignature]);
        op.signature = sign;

        validationData = await multisigValidator.validateSignature(op, userOpHash);
        expect(validationData).to.equal(1);

        // Signatures data too short
        sign = hexConcat([multisigValidator.address, "0x00", sign1]);
        op.signature = sign;
        await expect(multisigValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E203");

        // non-enabled wallet
        op.sender = wallet_2.address;
        sign = hexConcat([multisigValidator.address, "0x00"]);
        await expect(multisigValidator.validateSignature(op, userOpHash)).to.be.revertedWith("E203");
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

        await expect(multisigValidator.isValidSignature(messageHash, sign, wallet.address)).to.be.revertedWith("E210");

        sign = sign1;
        await expect(multisigValidator.isValidSignature(messageHash, sign, wallet.address)).to.be.revertedWith("E203");

        await expect(multisigValidator.isValidSignature(messageHash, "0x", wallet.address)).to.be.revertedWith("E504");
    });

    it("should validate typed data signature correctly", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 2;
        let initData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
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

        let sign1 = await signer1._signTypedData(domain, types, mail);
        let sign2 = await signer2._signTypedData(domain, types, mail);

        const splitSig1 = ethers.utils.splitSignature(sign1);
        const splitSig2 = ethers.utils.splitSignature(sign2);

        sign1 = ethers.utils.solidityPack(["bytes32", "bytes32", "uint8"], [splitSig1.r, splitSig1.s, splitSig1.v + 4]);
        sign2 = ethers.utils.solidityPack(["bytes32", "bytes32", "uint8"], [splitSig2.r, splitSig2.s, splitSig2.v + 4]);

        const messageHash = ethers.utils._TypedDataEncoder.hash(domain, types, mail);

        // The first 20 bytes of signature is validator's address
        // The 21th byte is the sig type
        let sign = signer1 < signer2 ? hexConcat([sign1, sign2]) : hexConcat([sign2, sign1]);

        let result = await multisigValidator.isValidSignature(messageHash, sign, wallet.address);
        expect(result).to.equal(true);

        let sign3 = await signer3._signTypedData(domain, types, mail);
        const splitSig3 = ethers.utils.splitSignature(sign3);
        sign3 = ethers.utils.solidityPack(["bytes32", "bytes32", "uint8"], [splitSig3.r, splitSig3.s, splitSig3.v + 4]);
        sign = signer3 < signer1 ? hexConcat([sign3, sign1]) : hexConcat([sign1, sign3]);

        await expect(multisigValidator.isValidSignature(messageHash, sign, wallet.address)).to.be.revertedWith("E210");

        sign = sign1;
        await expect(multisigValidator.isValidSignature(messageHash, sign, wallet.address)).to.be.revertedWith("E203");

        await expect(multisigValidator.isValidSignature(messageHash, "0x", wallet.address)).to.be.revertedWith("E504");
    });

    it("should check contract signature", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[wallet_2.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        initData = abiCoder.encode(["address"], [signer2.address]);
        await enablePlugin({
            executor: wallet_2,
            plugin: contractGuardian.address,
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
        let userOpHash = getUserOpHash(op, entryPoint, chainId);

        let sign = await signer2.signMessage(arrayify(userOpHash));
        let signature =
            "0x" +
            "000000000000000000000000" +
            wallet_2.address.slice(2) +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "00" + // r, s, v
            "0000000000000000000000000000000000000000000000000000000000000055"; // length: 20 bytes validator address + 65 bytes signature
        signature = hexConcat([signature, contractGuardian.address, sign]);
        await multisigValidator.checkNSignatures(wallet.address, userOpHash, signature, 1);
    });

    it("should fail for invalid contract siganture", async () => {
        let sudoValidator = multisigValidator;
        let threshold = 1;
        let initData = abiCoder.encode(["address[]", "uint256"], [[contractGuardian.address], threshold]);
        await enablePlugin({
            executor: wallet,
            plugin: sudoValidator.address,
            initData,
            selector: "enableValidator",
        });

        initData = abiCoder.encode(["address"], [signer2.address]);
        await enablePlugin({
            executor: wallet,
            plugin: contractGuardian.address,
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
        let userOpHash = getUserOpHash(op, entryPoint, chainId);

        let sign = await signer1.signMessage(arrayify(userOpHash));

        let signature =
            "0x" +
            "000000000000000000000000" +
            signer1.address.slice(2) +
            "0000000000000000000000000000000000000000000000000000000000000020" +
            "00" + // r, s, v
            "0000000000000000000000000000000000000000000000000000000000000000"; // Some data to read

        await expect(multisigValidator.checkNSignatures(wallet.address, userOpHash, signature, 1)).to.be.revertedWith(
            "E206"
        );

        signature =
            "0x" +
            "000000000000000000000000" +
            signer1.address.slice(2) +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "00"; // r, s, v

        await expect(multisigValidator.checkNSignatures(wallet.address, userOpHash, signature, 1)).to.be.revertedWith(
            "E207"
        );

        signature =
            "0x" +
            "000000000000000000000000" +
            signer1.address.slice(2) +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "00" + // r, s, v
            "0000000000000000000000000000000000000000000000000000000000000020"; // length

        await expect(multisigValidator.checkNSignatures(wallet.address, userOpHash, signature, 1)).to.be.revertedWith(
            "E208"
        );

        signature =
            "0x" +
            "000000000000000000000000" +
            signer1.address.slice(2) +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "00" + // r, s, v
            "0000000000000000000000000000000000000000000000000000000000000041"; // length

        signature = hexConcat([signature, sign]);
        await expect(multisigValidator.checkNSignatures(wallet.address, userOpHash, signature, 1)).to.be.revertedWith(
            "E209"
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

        let message = "hello world?";
        let messageHash = keccak256(toUtf8Bytes(message));
        let data = multisigValidator.interface.encodeFunctionData("approveHash", [messageHash]);
        await execute({
            executor: wallet,
            to: multisigValidator.address,
            data,
        });
        expect(await multisigValidator.isHashApproved(wallet.address, messageHash)).to.be.equal(true);

        let res = await multisigValidator.isValidSignature(messageHash, "0x", wallet.address);
        expect(res).to.be.equal(true);

        message = "hello world!";
        messageHash = keccak256(toUtf8Bytes(message));
        await expect(multisigValidator.isValidSignature(messageHash, "0x", wallet.address)).to.be.revertedWith("E504");
    });
});
