import { ethers } from "hardhat";
import { expect } from "chai";
import {
    MockEntryPoint,
    MockEntryPointManager,
    MockEntryPointManager__factory,
    MockEntryPoint__factory,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("EntryPointManager", () => {
    let entryPointManager: MockEntryPointManager;
    let mockEntryPoint: MockEntryPoint;
    let owner: SignerWithAddress;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();
        mockEntryPoint = await new MockEntryPoint__factory(owner).deploy();
        entryPointManager = await new MockEntryPointManager__factory(owner).deploy(mockEntryPoint.address);
    });

    it("should return the correct nonce", async () => {
        let key = 0;
        const nonce = await entryPointManager.getNonce(key);
        expect(nonce).to.equal(0); // Replace with the expected nonce value

        // Mock the getNonce function on the mock entrypoint
        const expectedNonce = 1234; // Replace with the expected nonce value
        await mockEntryPoint.setNonce(expectedNonce);

        // Call the getNonce function on the entry point manager
        const updatedNonce = await entryPointManager.getNonce(key);
        expect(updatedNonce).to.equal(expectedNonce);
    });

    it("should return the correct entrypoint address", async () => {
        const entryPointAddress = await entryPointManager.entryPoint();
        expect(entryPointAddress).to.equal(mockEntryPoint.address);
    });

    it("should require requests from the entrypoint", async () => {
        let key = 0;
        // Call a function on the entry point manager from an account other than the entrypoint
        await expect(
            entryPointManager.connect((await ethers.getSigners())[1]).checkFromEntryPoint()
        ).to.be.revertedWith("account: not from EntryPoint");

        // Call a function on the entry point manager from the entrypoint
        await expect(entryPointManager.getNonce(key)).to.not.be.reverted;
    });
});
