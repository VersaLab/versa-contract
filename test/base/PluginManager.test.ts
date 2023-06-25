import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { MockPluginManager__factory } from '../../typechain-types/factories/contracts/test/base/MockPluginManager__factory';
import { MockPluginManager } from '../../typechain-types/contracts/test/base/MockPluginManager';
import { MockHooks__factory, MockHooks } from '../../typechain-types';
import { parseEther } from 'ethers/lib/utils';
import * as helpers from "@nomicfoundation/hardhat-network-helpers"
import { enablePlugin } from './utils';

describe('PluginManager', () => {
  let pluginManager: MockPluginManager;
  let owner: SignerWithAddress;
  let plugin: MockHooks;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    // Deploy PluginManager contract
    pluginManager = await new MockPluginManager__factory(owner).deploy()
    plugin = await new MockHooks__factory(owner).deploy()
  });

  it('should execute transaction from enabled plugin', async () => {
    // Enable plugin
    await enablePlugin(pluginManager, plugin.address)

    // Execute transaction from plugin
    let tx = await plugin.executeToWallet(
      pluginManager.address,
      owner.address,
      parseEther('1')
    );

    // Check transaction failed
    expect(tx).to.emit(pluginManager, 'ExecutionFromPluginFailure').withArgs(plugin.address);

    await helpers.setBalance(pluginManager.address, parseEther("10"))
    tx = await plugin.executeToWallet(
        pluginManager.address,
        owner.address,
        parseEther('1')
      );

    expect(tx).to.emit(pluginManager, 'ExecutionFromPluginSuccess').withArgs(plugin.address);
  });

  it('should not execute transaction from disabled plugin', async () => {
    // Execute transaction from plugin
    await expect(pluginManager.execTransactionFromPlugin(
      plugin.address,
      parseEther('1'),
      '0x',
      0
    )).to.be.revertedWith('Only enabled plugin')
  });
});
