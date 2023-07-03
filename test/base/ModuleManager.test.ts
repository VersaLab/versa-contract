import { expect } from "chai";
import { ethers } from "hardhat";
import { ModuleManager, MockModule } from "../../typechain-types";
import { enablePlugin, disablePlugin, SENTINEL } from "./utils";
import { parseEther } from "ethers/lib/utils";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";

describe("ModuleManager", () => {
    let moduleManager: ModuleManager;
    let MODULE_1: string;
    let MODULE_2: string;
    let MODULE_3: string;

    beforeEach(async () => {
        const ModuleManager = await ethers.getContractFactory("MockModuleManager");
        moduleManager = await ModuleManager.deploy();
        await moduleManager.deployed();

        const ModuleFactory = await ethers.getContractFactory("MockModule");
        MODULE_1 = (await ModuleFactory.deploy()).address;
        MODULE_2 = (await ModuleFactory.deploy()).address;
        MODULE_3 = (await ModuleFactory.deploy()).address;
    });

    it("should enable and disable modules correctly", async () => {
        // Enable Module 1
        await enablePlugin({ executor: moduleManager, plugin: MODULE_1 });
        // await moduleManager.enableModule(MODULE_1, '0x');

        expect(await moduleManager.isModuleEnabled(MODULE_1)).to.be.true;
        expect(await moduleManager.isModuleEnabled(MODULE_2)).to.be.false;

        // Enable Module 2
        await enablePlugin({ executor: moduleManager, plugin: MODULE_2 });

        // await moduleManager.enableModule(MODULE_2, '0x');
        expect(await moduleManager.isModuleEnabled(MODULE_2)).to.be.true;

        // Disable Module 2
        // await moduleManager.disableModule(MODULE_1, MODULE_2);
        await disablePlugin(moduleManager, MODULE_2);
        expect(await moduleManager.isModuleEnabled(MODULE_2)).to.be.false;

        // Disable Module 1
        await disablePlugin(moduleManager, MODULE_1);
        expect(await moduleManager.isModuleEnabled(MODULE_1)).to.be.false;
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
        await expect(moduleManager.execTransactionFromModule(moduleManager.address, parseEther("1"), "0x", 0)).to.be.revertedWith("Only enabled module");
    });
});
