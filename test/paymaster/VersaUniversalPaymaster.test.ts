import { ethers } from "hardhat";
import { expect } from "chai";
import { VersaUniversalPaymaster__factory, VersaUniversalPaymaster, IERC20 } from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";

describe("VersaUniversaPaymaster", () => {
    let versaUniversaPaymaster: VersaUniversalPaymaster;
    let owner: SignerWithAddress;
    let operator: SignerWithAddress;
    let user: SignerWithAddress;

    let entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

    let v2SwapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    let v3SwapRouter = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    let usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    let usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

    let usdcWhaleAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    let usdtWhaleAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

    let usdc: IERC20;
    let usdt: IERC20;

    let abiCoder = new ethers.utils.AbiCoder();

    function numberToFixedHex(value: number, length: number): string {
        return "0x" + value.toString(16).padStart(length * 2, "0");
    }

    async function deployfixture() {
        [owner, operator, user] = await ethers.getSigners();
        versaUniversaPaymaster = await new VersaUniversalPaymaster__factory(owner).deploy(
            entryPointAddress,
            owner.address,
            operator.address,
            v2SwapRouter,
            v3SwapRouter,
            weth
        );
        usdc = await ethers.getContractAt("IERC20", usdcAddress);
        usdt = await ethers.getContractAt("IERC20", usdtAddress);

        let usdcWhale = await ethers.getImpersonatedSigner(usdcWhaleAddress);
        let usdtWhale = await ethers.getImpersonatedSigner(usdtWhaleAddress);

        usdc.connect(usdcWhale).transfer(versaUniversaPaymaster.address, ethers.utils.parseUnits("10000", 6));
        usdt.connect(usdtWhale).transfer(versaUniversaPaymaster.address, ethers.utils.parseUnits("10000", 6));

        return { owner, operator, user, versaUniversaPaymaster, usdc, usdt };
    }

    describe("roles", () => {
        beforeEach(async function () {
            let fixture = await helpers.loadFixture(deployfixture);
            owner = fixture.owner;
            operator = fixture.operator;
            user = fixture.user;
            versaUniversaPaymaster = fixture.versaUniversaPaymaster;
            usdc = fixture.usdc;
            usdt = fixture.usdt;
        });

        it("only owner", async () => {
            await expect(versaUniversaPaymaster.connect(user).setOperator(user.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("only operator", async () => {
            await expect(
                versaUniversaPaymaster
                    .connect(user)
                    .approveRouter(
                        [usdcAddress, usdtAddress],
                        [ethers.constants.MaxUint256, ethers.constants.MaxUint256]
                    )
            ).to.be.revertedWith("VersaUniversaPaymaster: Only operator");

            const v2SwapParas_1 = {
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMin: 100,
                path: [usdcAddress, weth],
            };

            await expect(
                versaUniversaPaymaster.connect(user).convertTokensAndDeposit([v2SwapParas_1], [])
            ).to.be.revertedWith("VersaUniversaPaymaster: Only operator");
        });
    });

    describe("swap handler", () => {
        beforeEach(async function () {
            let fixture = await helpers.loadFixture(deployfixture);
            owner = fixture.owner;
            operator = fixture.operator;
            versaUniversaPaymaster = fixture.versaUniversaPaymaster;
            usdc = fixture.usdc;
            usdt = fixture.usdt;

            await versaUniversaPaymaster
                .connect(operator)
                .approveRouter([usdcAddress, usdtAddress], [ethers.constants.MaxUint256, ethers.constants.MaxUint256]);
        });

        it("should approve router", async () => {
            expect(await usdc.allowance(versaUniversaPaymaster.address, v2SwapRouter)).to.be.equal(
                ethers.constants.MaxUint256
            );
            expect(await usdt.allowance(versaUniversaPaymaster.address, v2SwapRouter)).to.be.equal(
                ethers.constants.MaxUint256
            );
        });

        it("should convert through uniswapV2", async () => {
            const v2SwapParas_1 = {
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMin: 100,
                path: [usdcAddress, weth],
            };

            const v2SwapParas_2 = {
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMin: 100,
                path: [usdtAddress, weth],
            };
            const deposited = await versaUniversaPaymaster
                .connect(operator)
                .callStatic.convertTokensAndDeposit([v2SwapParas_1, v2SwapParas_2], []);

            expect(deposited).to.greaterThan(BigNumber.from(0));
        });

        it("should convert through uniswapV3", async () => {
            const v3SwapParas_1 = {
                path: ethers.utils.hexConcat([usdcAddress, numberToFixedHex(3000, 3), weth]),
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMinimum: 100,
            };

            const v3SwapParas_2 = {
                path: ethers.utils.hexConcat([usdtAddress, numberToFixedHex(3000, 3), weth]),
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMinimum: 100,
            };

            const deposited = await versaUniversaPaymaster
                .connect(operator)
                .callStatic.convertTokensAndDeposit([], [v3SwapParas_1, v3SwapParas_2]);

            expect(deposited).to.greaterThan(BigNumber.from(0));
        });

        it("should convert through v2 and v3", async () => {
            const v2SwapParas_1 = {
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMin: 100,
                path: [usdcAddress, weth],
            };

            const v2SwapParas_2 = {
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMin: 100,
                path: [usdtAddress, weth],
            };

            const v3SwapParas_1 = {
                path: ethers.utils.hexConcat([usdcAddress, numberToFixedHex(3000, 3), weth]),
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMinimum: 100,
            };

            const v3SwapParas_2 = {
                path: ethers.utils.hexConcat([usdtAddress, numberToFixedHex(3000, 3), weth]),
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMinimum: 100,
            };

            const deposited = await versaUniversaPaymaster
                .connect(operator)
                .callStatic.convertTokensAndDeposit([v2SwapParas_1, v2SwapParas_2], [v3SwapParas_1, v3SwapParas_2]);

            expect(deposited).to.greaterThan(BigNumber.from(0));
        });

        it("should only convert to weth", async () => {
            const v2SwapParas_1 = {
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMin: 100,
                path: [usdtAddress, usdcAddress],
            };

            await expect(
                versaUniversaPaymaster.connect(operator).convertTokensAndDeposit([v2SwapParas_1], [])
            ).to.be.revertedWith("UniswapV2Router: INVALID_PATH");

            const v3SwapParas_1 = {
                path: ethers.utils.hexConcat([usdcAddress, numberToFixedHex(3000, 3), usdtAddress]),
                amountIn: ethers.utils.parseUnits("1000", 6),
                amountOutMinimum: 100,
            };

            await expect(
                versaUniversaPaymaster.connect(operator).convertTokensAndDeposit([], [v3SwapParas_1])
            ).to.be.revertedWith("TokenSwapHandler: Only to wnative token allowed");
        });
    });
});
