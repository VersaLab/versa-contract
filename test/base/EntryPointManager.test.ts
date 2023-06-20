import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { MockEntryPoint, MockEntryPointManager } from "../../typechain-types"

describe('EntryPointManager', () => {
  let entryPointManager: MockEntryPointManager;
  let mockEntryPoint: MockEntryPoint

  beforeEach(async () => {
    let EntryPointManager = await ethers.getContractFactory('MockEntryPointManager');
    let MockEntryPoint = await ethers.getContractFactory('MockEntryPoint');

    mockEntryPoint = await MockEntryPoint.deploy();
    entryPointManager = await EntryPointManager.deploy(mockEntryPoint.address);
  });

  it('should return the correct nonce', async () => {
    const nonce = await entryPointManager.getNonce();
    expect(nonce).to.equal(0); // Replace with the expected nonce value

    // Mock the getNonce function on the mock entrypoint
    const expectedNonce = 1234; // Replace with the expected nonce value
    await mockEntryPoint.setNonce(expectedNonce)

    // Call the getNonce function on the entry point manager
    const updatedNonce = await entryPointManager.getNonce();
    expect(updatedNonce).to.equal(expectedNonce);
  });

  it('should return the correct entrypoint address', async () => {
    const entryPointAddress = await entryPointManager.entryPoint();
    expect(entryPointAddress).to.equal(mockEntryPoint.address);
  });

  it('should require requests from the entrypoint', async () => {
    // Call a function on the entry point manager from an account other than the entrypoint
    await expect(entryPointManager.connect((await ethers.getSigners())[1]).checkFromEntryPoint()).to.be.revertedWith(
      'account: not from EntryPoint'
    );

    // Call a function on the entry point manager from the entrypoint
    await expect(entryPointManager.getNonce()).to.not.be.reverted;
  });
});
