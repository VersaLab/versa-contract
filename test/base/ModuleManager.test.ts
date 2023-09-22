import { expect } from "chai";
import { ethers } from "hardhat";
import { MockModuleManager, MockModule, TestRevert__factory, TestRevert } from "../../typechain-types";
import { enablePlugin, disablePlugin, SENTINEL } from "./utils";
import { parseEther } from "ethers/lib/utils";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

describe("ModuleManager", () => {
    let owner: SignerWithAddress;
    let moduleManager: MockModuleManager;
    let MODULE_1: string;
    let MODULE_2: string;
    let MODULE_3: string;
    let TestRevert: TestRevert;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();
        const ModuleManager = await ethers.getContractFactory("MockModuleManager");
        moduleManager = await ModuleManager.deploy();
        await moduleManager.deployed();

        const ModuleFactory = await ethers.getContractFactory("MockModule");
        const ModuleFactory_2 = await ethers.getContractFactory("MockModule2");

        MODULE_1 = (await ModuleFactory.deploy()).address;
        MODULE_2 = (await ModuleFactory_2.deploy()).address;
        MODULE_3 = (await ModuleFactory.deploy()).address;

        TestRevert = await new TestRevert__factory(owner).deploy();
    });

    it("should enable and disable modules correctly", async () => {
        // Enable Module 1
        await enablePlugin({ executor: moduleManager, plugin: MODULE_1 });

        expect(await moduleManager.isModuleEnabled(MODULE_1)).to.be.true;
        expect(await moduleManager.isModuleEnabled(MODULE_2)).to.be.false;

        // Enable Module 2
        await enablePlugin({ executor: moduleManager, plugin: MODULE_2 });

        // await moduleManager.enableModule(MODULE_2, '0x');
        expect(await moduleManager.isModuleEnabled(MODULE_2)).to.be.true;

        await expect(moduleManager.connect(owner).enableModule("0x")).to.revertedWith("Unauthorized call");

        await expect(enablePlugin({ executor: moduleManager, plugin: owner.address })).to.reverted;

        // Disable Module 2
        // await moduleManager.disableModule(MODULE_1, MODULE_2);
        await expect(disablePlugin(moduleManager, MODULE_2))
            .to.emit(moduleManager, "DisabledModuleWithError")
            .withArgs(MODULE_2);
        expect(await moduleManager.isModuleEnabled(MODULE_2)).to.be.false;

        // Disable Module 1
        await expect(disablePlugin(moduleManager, MODULE_1))
            .to.emit(moduleManager, "DisabledModule")
            .withArgs(MODULE_1);
        expect(await moduleManager.isModuleEnabled(MODULE_1)).to.be.false;

        await expect(moduleManager.connect(owner).disableModule(SENTINEL, MODULE_1)).to.revertedWith(
            "Unauthorized call"
        );
    });

    it("should return the correct module array", async () => {
        // Enable multiple modules
        await enablePlugin({ executor: moduleManager, plugin: MODULE_1 });
        await enablePlugin({ executor: moduleManager, plugin: MODULE_2 });
        await enablePlugin({ executor: moduleManager, plugin: MODULE_3 });

        // Get paginated modules
        const pageSize = 2;
        let start = SENTINEL;
        let modules: string[] = [];

        do {
            let result = await moduleManager.getModulesPaginated(start, pageSize);
            start = result[result.length - 1];
            if (result[result.length - 1] === ethers.constants.AddressZero) {
                result = result.slice(0, result.length - 1);
            }
            modules.push(...result);
        } while (start !== ethers.constants.AddressZero);

        let expectedLength = 3;
        expect(modules).to.have.lengthOf(expectedLength);
        expect(modules).to.include(MODULE_1);
        expect(modules).to.include(MODULE_2);
        expect(modules).to.include(MODULE_3);

        expect(await moduleManager.moduleSize()).to.be.equal(expectedLength);
    });

    it("should execute transaction from enabled module", async () => {
        // Enable plugin
        await enablePlugin({ executor: moduleManager, plugin: MODULE_1 });

        let plugin = await ethers.getContractAt("MockModule", MODULE_1);

        let [signer] = await ethers.getSigners();
        // Execute transaction from plugin
        let tx = await plugin.executeToWallet(moduleManager.address, signer.address, parseEther("1"));

        // Check transaction failed
        expect(tx).to.emit(moduleManager, "ExecutionFromModuleFailure").withArgs(plugin.address);

        await helpers.setBalance(moduleManager.address, parseEther("10"));
        tx = await plugin.executeToWallet(moduleManager.address, signer.address, parseEther("1"));

        expect(tx).to.emit(moduleManager, "ExecutionFromPluginSuccess").withArgs(plugin.address);
    });

    it("should not execute transaction from disabled plugin", async () => {
        // Execute transaction from plugin
        await expect(
            moduleManager.execTransactionFromModule(moduleManager.address, parseEther("1"), "0x", 0)
        ).to.be.revertedWith("Only enabled module");
    });

    it("should correctly return error message", async () => {
        await expect(
            moduleManager.execute(TestRevert.address, 0, TestRevert.interface.encodeFunctionData("testRevert", [0]), 0)
        ).to.revertedWithoutReason();

        await expect(
            moduleManager.execute(TestRevert.address, 0, TestRevert.interface.encodeFunctionData("testRevert", [1]), 0)
        ).to.revertedWithCustomError(TestRevert, "TestError");

        await expect(
            moduleManager.execute(TestRevert.address, 0, TestRevert.interface.encodeFunctionData("testRevert", [2]), 0)
        ).to.revertedWithCustomError(TestRevert, "TestErrorWithoutPara");

        await expect(
            moduleManager.execute(TestRevert.address, 0, TestRevert.interface.encodeFunctionData("testRevert", [3]), 0)
        )
            .to.revertedWithCustomError(TestRevert, "TestErrorWithMultiPara")
            .withArgs(3, 1, 2, 3);

        await expect(
            moduleManager.execute(TestRevert.address, 0, TestRevert.interface.encodeFunctionData("testRevert", [4]), 0)
        ).to.revertedWith("test revert string");

        await expect(
            moduleManager.execute(TestRevert.address, 0, TestRevert.interface.encodeFunctionData("testRevert", [5]), 0)
        ).to.revertedWithPanic(0x11);
    });
});
