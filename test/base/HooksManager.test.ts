import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { MockHooksManager, MockHooks } from "../../typechain-types";
import { SENTINEL, execute, enablePlugin, disablePlugin } from "./utils";
import { MockHooksManagerInterface } from "../../typechain-types/contracts/test/MockHooksManager";
import { parseEther } from "ethers/lib/utils";

describe("HooksManager", () => {
  let hooksManager: MockHooksManager;
  let mockHooks: MockHooks;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  let HooksManagerInterface:  MockHooksManagerInterface

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy MockHooks contract
    const mockHooksFactory = await ethers.getContractFactory("MockHooks");
    mockHooks = await mockHooksFactory.deploy();
    await mockHooks.deployed();

    // Deploy HooksManager contract
    const hooksManagerFactory = await ethers.getContractFactory("MockHooksManager");
    hooksManager = await hooksManagerFactory.deploy();
    await hooksManager.deployed();

    HooksManagerInterface = hooksManager.interface
  });

  it('should enable hooks', async () => {
    // Enable hooks
    await enablePlugin(hooksManager, mockHooks.address)
    expect(await hooksManager.isHooksEnabled(mockHooks.address)).to.be.true;
  });

  it('should disable hooks', async () => {
    // Enable hooks
    await enablePlugin(hooksManager, mockHooks.address);
    expect(await hooksManager.isHooksEnabled(mockHooks.address)).to.be.true;
  
    // Disable hooks
    await disablePlugin(hooksManager, mockHooks.address)
    expect(await hooksManager.isHooksEnabled(mockHooks.address)).to.be.false;
  
    // Check if hooks are removed from the list
    const prehooksList = await hooksManager.getPreHooksPaginated(SENTINEL, 1);
    const afterhooksList = await hooksManager.getPostHooksPaginated(SENTINEL, 1);
    expect(prehooksList[0]).to.be.equal(ethers.constants.AddressZero);
    expect(afterhooksList[0]).to.be.equal(ethers.constants.AddressZero);
  
    const hooksSize = await hooksManager.hooksSize();
    expect(hooksSize.beforeTxHooksSize).to.be.equal(0);
    expect(hooksSize.afterTxHooksSize).to.be.equal(0);
  });

  it('should not enable invalid hooks contract', async () => {
    // Try to enable an invalid hooks contract
    const invalidHooks = owner.address
  
    await expect(enablePlugin(hooksManager, invalidHooks)).to.be.revertedWithoutReason()
  
    // Ensure the hooks are not enabled
    expect(await hooksManager.isHooksEnabled(invalidHooks)).to.be.false;
  });

  it('should execute before and after transaction hooks', async () => {
    // Enable hooks
    await enablePlugin(hooksManager, mockHooks.address)
    expect(await hooksManager.isHooksEnabled(mockHooks.address)).to.be.true;

    await helpers.setBalance(hooksManager.address, parseEther("1"))

    // Execute transaction
    await execute({
        executor: hooksManager,
        to: addr1.address,
        value: parseEther("1")
    })

    // Check if hooks are called
    expect(await mockHooks.beforeTransactionCalled()).to.be.true;
    expect(await mockHooks.afterTransactionCalled()).to.be.true;
  });

  it('should return hooks list', async () => {
    // Enable hooks
    await enablePlugin(hooksManager, mockHooks.address)
    expect(await hooksManager.isHooksEnabled(mockHooks.address)).to.be.true;

    let prehooksList = await hooksManager.getPreHooksPaginated(SENTINEL, 5)
    let afterhooksList = await hooksManager.getPostHooksPaginated(SENTINEL, 5)

    expect(prehooksList[0]).to.be.equal(mockHooks.address)
    expect(afterhooksList[0]).to.be.equal(mockHooks.address)

    let hooksSize = await hooksManager.hooksSize()
    let expectedHooksSize = 1
    expect(hooksSize.beforeTxHooksSize).to.be.equal(expectedHooksSize)
    expect(hooksSize.afterTxHooksSize).to.be.equal(expectedHooksSize)

    // Deploy MockHooks contract
    const mockHooksFactory = await ethers.getContractFactory("MockHooks");
    let mockHooks2 = await mockHooksFactory.deploy();
    await mockHooks2.deployed();

    // Enable the second hooks contract
    await enablePlugin(hooksManager, mockHooks2.address)
    expect(await hooksManager.isHooksEnabled(mockHooks2.address)).to.be.true;

    prehooksList = await hooksManager.getPreHooksPaginated(SENTINEL, 5)
    afterhooksList = await hooksManager.getPostHooksPaginated(SENTINEL, 5)

    expect(prehooksList[0]).to.be.equal(mockHooks2.address)
    expect(afterhooksList[0]).to.be.equal(mockHooks2.address)

    expect(prehooksList[1]).to.be.equal(mockHooks.address)
    expect(afterhooksList[1]).to.be.equal(mockHooks.address)

    hooksSize = await hooksManager.hooksSize()
    expectedHooksSize = 2

    expect(hooksSize.beforeTxHooksSize).to.be.equal(expectedHooksSize)
    expect(hooksSize.afterTxHooksSize).to.be.equal(expectedHooksSize)
  })
});

