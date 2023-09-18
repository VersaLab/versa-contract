import { ethers } from "hardhat";
import { expect } from "chai";
import {
    VersaAccountFactory,
    VersaWallet,
    VersaAccountFactory__factory,
    VersaWallet__factory,
    MockValidator,
    MockModule,
    MockHooks,
    MockValidator__factory,
    MockHooks__factory,
    MockModule__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { computeWalletAddress } from "./utils";
import { BigNumber } from "ethers";

describe("VersaFactory", () => {
    let versaFactory: VersaAccountFactory;
    let versaWalletSingleton: VersaWallet;
    let validator: MockValidator;
    let module: MockModule;
    let hooks: MockHooks;
    let owner: SignerWithAddress;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();

        let entryPoint = ethers.constants.AddressZero;
        let fallbackHandler = ethers.constants.AddressZero;

        // Deploy versa singleton
        versaWalletSingleton = await new VersaWallet__factory(owner).deploy(entryPoint);

        // Deploy VersaAccountFactory
        versaFactory = await new VersaAccountFactory__factory(owner).deploy(
            versaWalletSingleton.address,
            fallbackHandler
        );

        validator = await new MockValidator__factory(owner).deploy();
        hooks = await new MockHooks__factory(owner).deploy();
        module = await new MockModule__factory(owner).deploy();
    });

    it("should deploy and initialize versa wallet", async () => {
        await versaFactory.createAccount(
            [validator.address],
            ["0x"],
            [1],
            [hooks.address],
            ["0x"],
            [module.address],
            ["0x"],
            0
        );

        let walletAddress = await versaFactory.getAddress(
            [validator.address],
            ["0x"],
            [1],
            [hooks.address],
            ["0x"],
            [module.address],
            ["0x"],
            0
        );

        let wallet = VersaWallet__factory.connect(walletAddress, owner);
        expect(await wallet.VERSA_VERSION()).to.not.be.equal(null);

        expect(await wallet.moduleSize()).to.be.equal(1);
        let validatorSize = await wallet.validatorSize();
        expect(validatorSize.sudoSize).to.be.equal(1);
        expect(validatorSize.normalSize).to.be.equal(0);

        let hooksSize = await wallet.hooksSize();
        expect(hooksSize.beforeTxHooksSize).to.be.equal(1);
        expect(hooksSize.afterTxHooksSize).to.be.equal(1);
    });

    it("should calculate wallet address off-chain", async () => {
        const salt = BigNumber.from(0);
        let walletAddress = await versaFactory.getAddress(
            [validator.address],
            ["0x"],
            [1],
            [hooks.address],
            ["0x"],
            [module.address],
            ["0x"],
            salt
        );
        let fallbackHandler = ethers.constants.AddressZero;
        const versaProxyCreationCode = await versaFactory.proxyCreationCode();

        let computedAddress = await computeWalletAddress(
            fallbackHandler,
            [validator.address],
            ["0x"],
            [1],
            [hooks.address],
            ["0x"],
            [module.address],
            ["0x"],
            versaProxyCreationCode,
            versaWalletSingleton.address,
            versaFactory.address,
            salt
        );
        expect(computedAddress).to.be.equal(walletAddress);
    });

    it("should return wallet address if already created", async () => {
        await versaFactory.createAccount(
            [validator.address],
            ["0x"],
            [1],
            [hooks.address],
            ["0x"],
            [module.address],
            ["0x"],
            0
        );

        expect(
            await versaFactory.callStatic.createAccount(
                [validator.address],
                ["0x"],
                [1],
                [hooks.address],
                ["0x"],
                [module.address],
                ["0x"],
                0
            )
        ).to.be.equal(
            await versaFactory.getAddress(
                [validator.address],
                ["0x"],
                [1],
                [hooks.address],
                ["0x"],
                [module.address],
                ["0x"],
                0
            )
        );
    });
});
