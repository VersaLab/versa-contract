import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { expect } from "chai";
import * as helper from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseEther, AbiCoder } from "ethers/lib/utils";
import { deployVersaWallet } from "../utils";
import { enablePlugin, disablePlugin, execute } from "../base/utils";
import {
    SpendingLimitHooks,
    SpendingLimitHooks__factory,
    MockToken,
    MockToken__factory,
    VersaWallet,
} from "../../typechain-types";

describe("SpendingLimitHooks", () => {
    let owner: SignerWithAddress;
    let wallet: VersaWallet;
    let spendingLimitHooks: SpendingLimitHooks;
    let token: MockToken;
    let abiCoder: AbiCoder;
    let nativeTokenAddress: string;
    let erc20TokenAddress: string;
    let erc20TokenDecimal: number;
    let data: any;
    let tx: any;
    let initData: any;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();
        wallet = await deployVersaWallet({ signer: owner, entryPoint: owner.address });
        spendingLimitHooks = await new SpendingLimitHooks__factory(owner).deploy();
        token = await new MockToken__factory(owner).deploy("MockToken", "MT");
        abiCoder = new AbiCoder();
        nativeTokenAddress = ethers.constants.AddressZero;
        erc20TokenAddress = token.address;
        erc20TokenDecimal = await token.decimals();

        await token.connect(owner).transfer(wallet.address, await token.balanceOf(owner.address));
        await helper.setBalance(wallet.address, parseEther("10000"));
        let tempWalletBalance = await ethers.provider.getBalance(wallet.address);
        expect(tempWalletBalance).to.equal(parseEther("10000"));
        tempWalletBalance = await token.balanceOf(wallet.address);
        expect(tempWalletBalance).to.equal(BigNumber.from(10000).mul(BigNumber.from(10).pow(erc20TokenDecimal)));
    });

    it("check onlyEnabledHooks", async () => {
        data = spendingLimitHooks.interface.encodeFunctionData("initWalletConfig", ["0x"]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("Hooks: this hooks is not enabled");
    });

    it("check initWalletConfig", async () => {
        initData = abiCoder.encode(["address"], [nativeTokenAddress]);
        tx = enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            initData: initData,
            selector: "enableHooks",
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: parse error");

        let configs = [
            {
                tokenAddress: nativeTokenAddress,
                allowanceAmount: parseEther("100"),
                resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60),
                resetTimeIntervalMinutes: 30,
            },
            {
                tokenAddress: erc20TokenAddress,
                allowanceAmount: BigNumber.from(100).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
                resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60),
                resetTimeIntervalMinutes: 30,
            },
        ];
        initData = abiCoder.encode(
            [
                "tuple(address tokenAddress,uint256 allowanceAmount,uint32 resetBaseTimeMinutes,uint16 resetTimeIntervalMinutes)[]",
            ],
            [configs]
        );
        tx = enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            initData: initData,
            selector: "enableHooks",
        });
        await expect(tx)
            .to.emit(spendingLimitHooks, "SetSpendingLimit")
            .withArgs(
                wallet.address,
                nativeTokenAddress,
                configs[0].allowanceAmount,
                configs[0].resetBaseTimeMinutes,
                configs[0].resetTimeIntervalMinutes
            )
            .to.emit(spendingLimitHooks, "SetSpendingLimit")
            .withArgs(
                wallet.address,
                erc20TokenAddress,
                configs[1].allowanceAmount,
                configs[1].resetBaseTimeMinutes,
                configs[1].resetTimeIntervalMinutes
            )
            .to.emit(spendingLimitHooks, "InitWalletConfig")
            .withArgs(wallet.address)
            .to.emit(wallet, "EnabledHooks")
            .withArgs(spendingLimitHooks.address);

        let spendingLimitInfos = await spendingLimitHooks.batchGetSpendingLimitInfo(wallet.address, [
            nativeTokenAddress,
            erc20TokenAddress,
        ]);
        expect(spendingLimitInfos[0].allowanceAmount).to.equal(configs[0].allowanceAmount);
        expect(spendingLimitInfos[0].spentAmount).to.equal(0);
        expect(spendingLimitInfos[0].lastResetTimeMinutes).to.equal(configs[0].resetBaseTimeMinutes);
        expect(spendingLimitInfos[0].resetTimeIntervalMinutes).to.equal(configs[0].resetTimeIntervalMinutes);
        expect(spendingLimitInfos[1].allowanceAmount).to.equal(configs[1].allowanceAmount);
        expect(spendingLimitInfos[1].spentAmount).to.equal(0);
        expect(spendingLimitInfos[1].lastResetTimeMinutes).to.equal(configs[1].resetBaseTimeMinutes);
        expect(spendingLimitInfos[1].resetTimeIntervalMinutes).to.equal(configs[1].resetTimeIntervalMinutes);
    });

    it("check cover batchSetSpendingLimit ", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });

        let errorERC20TokenConfig = {
            tokenAddress: owner.address,
            allowanceAmount: 1,
            resetBaseTimeMinutes: 1,
            resetTimeIntervalMinutes: 1,
        };
        let data = spendingLimitHooks.interface.encodeFunctionData("setSpendingLimit", [errorERC20TokenConfig]);
        await expect(
            execute({
                executor: wallet,
                to: spendingLimitHooks.address,
                data: data,
            })
        ).to.be.revertedWithoutReason();

        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        let spendingLimitInfos = await spendingLimitHooks.batchGetSpendingLimitInfo(wallet.address, [
            nativeTokenAddress,
            erc20TokenAddress,
        ]);
        expect(spendingLimitInfos[0].allowanceAmount).to.equal(nativeTokenConfig.allowanceAmount);
        expect(spendingLimitInfos[0].spentAmount).to.equal(0);
        expect(spendingLimitInfos[0].lastResetTimeMinutes).to.equal(
            nativeTokenConfig.resetBaseTimeMinutes + nativeTokenConfig.resetTimeIntervalMinutes
        );
        expect(spendingLimitInfos[0].resetTimeIntervalMinutes).to.equal(nativeTokenConfig.resetTimeIntervalMinutes);
        expect(spendingLimitInfos[1].allowanceAmount).to.equal(erc20TokenConfig.allowanceAmount);
        expect(spendingLimitInfos[1].spentAmount).to.equal(0);
        expect(spendingLimitInfos[1].lastResetTimeMinutes).to.equal(
            erc20TokenConfig.resetBaseTimeMinutes + nativeTokenConfig.resetTimeIntervalMinutes
        );
        expect(spendingLimitInfos[1].resetTimeIntervalMinutes).to.equal(erc20TokenConfig.resetTimeIntervalMinutes);
    });

    it("check simulateSpendingLimitTransaction", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });
        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        await expect(
            spendingLimitHooks.simulateSpendingLimitTransaction(wallet.address, owner.address, 1, "0x", 0)
        ).to.be.revertedWithCustomError(spendingLimitHooks, "SpendingLimitSimulate");
        await expect(
            spendingLimitHooks.simulateSpendingLimitTransaction(
                wallet.address,
                token.address,
                0,
                token.interface.encodeFunctionData("transfer", [owner.address, 1]),
                0
            )
        ).to.be.revertedWithCustomError(spendingLimitHooks, "SpendingLimitSimulate");
    });

    it("check beforeTransaction hook", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });
        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [owner.address, 0, "0x", 1]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: not allow delegatecall");

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            owner.address,
            parseEther("201"),
            "0x",
            0,
        ]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: token overspending");

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            owner.address,
            parseEther("200"),
            "0x",
            0,
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        let spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, nativeTokenAddress);
        expect(spendingLimitInfo.spentAmount).to.equal(parseEther("200"));

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("transfer", [
                owner.address,
                BigNumber.from(201).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: token overspending");

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("increaseAllowance", [
                owner.address,
                BigNumber.from(201).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: token overspending");

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("approve", [
                owner.address,
                BigNumber.from(201).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: token overspending");

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("transfer", [
                owner.address,
                BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, erc20TokenAddress);
        expect(spendingLimitInfo.spentAmount).to.equal(
            BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal))
        );

        data = spendingLimitHooks.interface.encodeFunctionData("resetSpendingLimit", [erc20TokenAddress]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("increaseAllowance", [
                owner.address,
                BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, erc20TokenAddress);
        expect(spendingLimitInfo.spentAmount).to.equal(
            BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal))
        );

        data = spendingLimitHooks.interface.encodeFunctionData("resetSpendingLimit", [erc20TokenAddress]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("approve", [
                wallet.address,
                BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, erc20TokenAddress);
        expect(spendingLimitInfo.spentAmount).to.equal(
            BigNumber.from(0).mul(BigNumber.from(10).pow(erc20TokenDecimal))
        );

        data = spendingLimitHooks.interface.encodeFunctionData("resetSpendingLimit", [erc20TokenAddress]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("transferFrom", [
                wallet.address,
                owner.address,
                BigNumber.from(201).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: token overspending");

        data = spendingLimitHooks.interface.encodeFunctionData("beforeTransaction", [
            token.address,
            0,
            token.interface.encodeFunctionData("transferFrom", [
                wallet.address,
                owner.address,
                BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            ]),
            0,
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, erc20TokenAddress);
        expect(spendingLimitInfo.spentAmount).to.equal(
            BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal))
        );
    });

    it("check afterTransaction hook", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });
        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        data = spendingLimitHooks.interface.encodeFunctionData("afterTransaction", [owner.address, 1, "0x", 0]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.be.revertedWith("SpendingLimitHooks: afterTransaction hook is not allowed");
    });

    it("check resetSpendingLimit", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });
        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        data = spendingLimitHooks.interface.encodeFunctionData("resetSpendingLimit", [nativeTokenAddress]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.emit(spendingLimitHooks, "ResetSpendingLimit").withArgs(wallet.address, nativeTokenAddress);

        data = spendingLimitHooks.interface.encodeFunctionData("resetSpendingLimit", [erc20TokenAddress]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.emit(spendingLimitHooks, "ResetSpendingLimit").withArgs(wallet.address, erc20TokenAddress);

        let spendingLimitInfos = await spendingLimitHooks.batchGetSpendingLimitInfo(wallet.address, [
            nativeTokenAddress,
            erc20TokenAddress,
        ]);
        expect(spendingLimitInfos[0].spentAmount).to.equal(0);
        expect(spendingLimitInfos[1].spentAmount).to.equal(0);
    });

    it("check deleteSpendingLimit", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });
        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        data = spendingLimitHooks.interface.encodeFunctionData("deleteSpendingLimit", [nativeTokenAddress]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx)
            .to.emit(spendingLimitHooks, "DeleteSpendingLimit")
            .withArgs(wallet.address, nativeTokenAddress);
        let spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, nativeTokenAddress);
        expect(spendingLimitInfo.allowanceAmount).to.equal(0);
        expect(spendingLimitInfo.spentAmount).to.equal(0);
        expect(spendingLimitInfo.lastResetTimeMinutes).to.equal(0);
        expect(spendingLimitInfo.resetTimeIntervalMinutes).to.equal(0);

        data = spendingLimitHooks.interface.encodeFunctionData("deleteSpendingLimit", [erc20TokenAddress]);
        tx = execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });
        await expect(tx).to.emit(spendingLimitHooks, "DeleteSpendingLimit").withArgs(wallet.address, erc20TokenAddress);
        spendingLimitInfo = await spendingLimitHooks.getSpendingLimitInfo(wallet.address, erc20TokenAddress);
        expect(spendingLimitInfo.allowanceAmount).to.equal(0);
        expect(spendingLimitInfo.spentAmount).to.equal(0);
        expect(spendingLimitInfo.lastResetTimeMinutes).to.equal(0);
        expect(spendingLimitInfo.resetTimeIntervalMinutes).to.equal(0);
    });

    it("check clearWalletConfig", async () => {
        await enablePlugin({
            executor: wallet,
            plugin: spendingLimitHooks.address,
            selector: "enableHooks",
        });
        let nativeTokenConfig = {
            tokenAddress: nativeTokenAddress,
            allowanceAmount: parseEther("200"),
            resetBaseTimeMinutes: Math.floor((await helper.time.latest()) / 60) - 16,
            resetTimeIntervalMinutes: 15,
        };
        let erc20TokenConfig = {
            tokenAddress: erc20TokenAddress,
            allowanceAmount: BigNumber.from(200).mul(BigNumber.from(10).pow(erc20TokenDecimal)),
            resetBaseTimeMinutes: nativeTokenConfig.resetBaseTimeMinutes,
            resetTimeIntervalMinutes: nativeTokenConfig.resetTimeIntervalMinutes,
        };
        data = spendingLimitHooks.interface.encodeFunctionData("batchSetSpendingLimit", [
            [nativeTokenConfig, erc20TokenConfig],
        ]);
        await execute({
            executor: wallet,
            to: spendingLimitHooks.address,
            data: data,
        });

        await expect(disablePlugin(wallet, spendingLimitHooks.address))
            .to.emit(spendingLimitHooks, "ClearWalletConfig")
            .withArgs(wallet.address)
            .to.emit(wallet, "DisabledHooks")
            .withArgs(spendingLimitHooks.address);
    });
});
