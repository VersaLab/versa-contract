import { ethers } from "hardhat";
import { expect } from "chai";
import {
    VersaAccountFactory,
    VersaWallet,
    CompatibilityFallbackHandler,
    VersaAccountFactory__factory,
    VersaWallet__factory,
    MockValidator,
    MockModule,
    MockHooks,
    MockValidator__factory,
    MockHooks__factory,
    MockModule__factory,
    MockEntryPoint,
    MockEntryPoint__factory,
    CompatibilityFallbackHandler__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseEther } from "ethers/lib/utils";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { getCreationData } from "./utils";

describe("VersaWallet", () => {
    let versaFactory: VersaAccountFactory;
    let versaWalletSingleton: VersaWallet;
    let sudoValidator: MockValidator;
    let normalValidator: MockValidator;
    let module: MockModule;
    let hooks: MockHooks;
    let owner: SignerWithAddress;
    let entryPoint: SignerWithAddress;
    let opHasher: MockEntryPoint;
    let wallet: VersaWallet;
    let fallbackHandler: CompatibilityFallbackHandler;

    let creationData: any;

    beforeEach(async () => {
        [entryPoint, owner] = await ethers.getSigners();

        opHasher = await new MockEntryPoint__factory(owner).deploy();

        fallbackHandler = await new CompatibilityFallbackHandler__factory(owner).deploy();

        // Deploy versa singleton
        versaWalletSingleton = await new VersaWallet__factory(owner).deploy(entryPoint.address);
        // Deploy VersaAccountFactory
        versaFactory = await new VersaAccountFactory__factory(owner).deploy(
            versaWalletSingleton.address,
            fallbackHandler.address,
            entryPoint.address,
            owner.address
        );

        sudoValidator = await new MockValidator__factory(owner).deploy();
        normalValidator = await new MockValidator__factory(owner).deploy();
        hooks = await new MockHooks__factory(owner).deploy();
        module = await new MockModule__factory(owner).deploy();

        creationData = getCreationData({
            salt: 0,
            validators: [sudoValidator.address, normalValidator.address],
            validatorType: [1, 2],
            validatorInitData: ["0x", "0x"],
            hooks: [hooks.address],
            hooksInitData: ["0x"],
            modules: [module.address],
            moduleInitData: ["0x"],
        });

        await versaFactory.createAccount(
            creationData.validatorCreationData,
            creationData.hookCreationData,
            creationData.moduleCreationData,
            creationData.salt
        );

        let walletAddress = await versaFactory.getAddress(
            creationData.validatorCreationData,
            creationData.hookCreationData,
            creationData.moduleCreationData,
            creationData.salt
        );

        wallet = VersaWallet__factory.connect(walletAddress, owner);
        expect(await wallet.VERSA_VERSION()).to.not.be.equal(null);
    });

    it("should not initialize twice", async () => {
        await expect(
            wallet.initialize(
                fallbackHandler.address,
                creationData.validatorCreationData,
                creationData.hookCreationData,
                creationData.moduleCreationData
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should receive native token", async () => {
        const balanceBefore = await ethers.provider.getBalance(wallet.address);
        await owner.sendTransaction({ to: wallet.address, value: parseEther("0.1") });
        const balanceAfter = await ethers.provider.getBalance(wallet.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.equal(parseEther("0.1"));
    });

    it("should valdiate userOp correctly", async () => {
        await helpers.setBalance(wallet.address, parseEther("1"));
        let sudoExecuteData = wallet.interface.encodeFunctionData("sudoExecute", [
            owner.address,
            parseEther("0.1"),
            "0x",
            0,
        ]);
        let op = {
            sender: wallet.address,
            nonce: 0,
            initCode: "0x",
            callData: sudoExecuteData,
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: sudoValidator.address,
        };
        let opHash = await opHasher.getUserOpHash(op);
        await expect(wallet.callStatic.validateUserOp(op, opHash, parseEther("0.1"))).to.be.revertedWith("E100");
        await wallet.connect(entryPoint).validateUserOp(op, opHash, parseEther("0.1"));
        expect(await owner.provider?.getBalance(wallet.address)).to.be.equal(parseEther("0.9"));
    });

    it("should prevent invalid validator", async () => {
        await helpers.setBalance(wallet.address, parseEther("1"));
        let sudoExecuteData = wallet.interface.encodeFunctionData("sudoExecute", [
            owner.address,
            parseEther("0.1"),
            "0x",
            0,
        ]);
        let op = {
            sender: wallet.address,
            nonce: 0,
            initCode: "0x",
            callData: sudoExecuteData,
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: ethers.constants.AddressZero,
        };
        let opHash = await opHasher.getUserOpHash(op);
        await expect(wallet.connect(entryPoint).validateUserOp(op, opHash, parseEther("0.1"))).to.be.revertedWith(
            "E104"
        );
    });

    it("should execute", async () => {
        await helpers.setBalance(wallet.address, parseEther("10"));
        let ethValue = parseEther("1");
        let sudoExecuteData = wallet.interface.encodeFunctionData("sudoExecute", [
            owner.address,
            parseEther("1"),
            "0x",
            0,
        ]);
        let batchSudoExecuteData = wallet.interface.encodeFunctionData("batchSudoExecute", [
            [owner.address],
            [parseEther("1")],
            ["0x"],
            [0],
        ]);
        let batchNormalExecuteData = wallet.interface.encodeFunctionData("batchNormalExecute", [
            [owner.address],
            [parseEther("1")],
            ["0x"],
            [0],
        ]);
        let op = {
            sender: wallet.address,
            nonce: 0,
            initCode: "0x",
            callData: sudoExecuteData,
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: sudoValidator.address,
        };
        let opHash = await opHasher.getUserOpHash(op);
        let res = await wallet.connect(entryPoint).callStatic.validateUserOp(op, opHash, ethValue);
        expect(res).to.be.equal(0);

        op.callData = batchSudoExecuteData;
        opHash = await opHasher.getUserOpHash(op);
        res = await wallet.connect(entryPoint).callStatic.validateUserOp(op, opHash, parseEther("100000000000"));
        expect(res).to.be.equal(0);

        op.callData = batchNormalExecuteData;
        opHash = await opHasher.getUserOpHash(op);
        res = await wallet.connect(entryPoint).callStatic.validateUserOp(op, opHash, parseEther("100000000000"));
        expect(res).to.be.equal(0);

        await wallet.connect(entryPoint).sudoExecute(owner.address, ethValue, "0x", 0);
        expect(await owner.provider?.getBalance(wallet.address)).to.be.equal(parseEther("9"));

        await wallet.connect(entryPoint).normalExecute(owner.address, ethValue, "0x", 0);
        expect(await owner.provider?.getBalance(wallet.address)).to.be.equal(parseEther("8"));

        await wallet.connect(entryPoint).batchSudoExecute([owner.address], [ethValue], ["0x"], [0]);
        expect(await owner.provider?.getBalance(wallet.address)).to.be.equal(parseEther("7"));

        await wallet.connect(entryPoint).batchNormalExecute([owner.address], [0], ["0x"], [0]);
        expect(await owner.provider?.getBalance(wallet.address)).to.be.equal(parseEther("7"));
    });

    it("should have right batch data length", async function () {
        await expect(
            wallet.connect(entryPoint).batchSudoExecute([owner.address, ethers.constants.AddressZero], [0], ["0x"], [0])
        ).to.be.revertedWith("E105");
        await expect(
            wallet.connect(entryPoint).batchSudoExecute([owner.address], [0], ["0x", "0x"], [0])
        ).to.be.revertedWith("E105");
        await expect(
            wallet.connect(entryPoint).batchSudoExecute([owner.address], [0], ["0x"], [0, 0])
        ).to.be.revertedWith("E105");
    });

    it("should revert if validator and selector don't match", async () => {
        await helpers.setBalance(wallet.address, parseEther("1"));
        let sudoExecuteData = wallet.interface.encodeFunctionData("sudoExecute", [
            owner.address,
            parseEther("0.1"),
            "0x",
            0,
        ]);
        let op = {
            sender: wallet.address,
            nonce: 0,
            initCode: "0x",
            callData: sudoExecuteData,
            callGasLimit: 2150000,
            verificationGasLimit: 2150000,
            preVerificationGas: 2150000,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: "0x",
            signature: normalValidator.address,
        };
        let opHash = await opHasher.getUserOpHash(op);
        await expect(wallet.connect(entryPoint).validateUserOp(op, opHash, parseEther("0.1"))).to.be.revertedWith(
            "E102"
        );
    });

    it("should allow self-transfer for normal transaction", async () => {
        await helpers.setBalance(wallet.address, parseEther("1"));

        // Perform a self call
        await wallet.connect(entryPoint).normalExecute(wallet.address, parseEther("0.1"), "0x", 0);
        expect(await owner.provider?.getBalance(wallet.address)).to.be.equal(parseEther("1"));
    });

    it("should revert if normal execution uses banned operation", async () => {
        await helpers.setBalance(wallet.address, parseEther("1"));

        // Perform a self call
        await expect(
            wallet.connect(entryPoint).normalExecute(wallet.address, parseEther("0.1"), "0xaaaaaaaa", 0)
        ).to.be.revertedWith("E103");

        // Use delegatecall
        await expect(
            wallet.connect(entryPoint).normalExecute(ethers.constants.AddressZero, parseEther("0.1"), "0x", 1)
        ).to.be.revertedWith("E103");

        // Call to enabled plugin
        await expect(
            wallet.connect(entryPoint).normalExecute(module.address, parseEther("0.1"), "0x", 1)
        ).to.be.revertedWith("E103");

        // Call to enabled plugin
        await expect(
            wallet.connect(entryPoint).normalExecute(sudoValidator.address, parseEther("0.1"), "0x", 1)
        ).to.be.revertedWith("E103");

        // Call to enabled plugin
        await expect(
            wallet.connect(entryPoint).normalExecute(hooks.address, parseEther("0.1"), "0x", 1)
        ).to.be.revertedWith("E103");
    });
});
