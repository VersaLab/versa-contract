import { ethers } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    MockValidator__factory,
    MockSessionKeyValidator,
    MockSessionKeyValidator__factory,
    MockToken__factory,
    MockToken,
    VersaWallet,
    MockValidator,
    ECDSAValidator__factory,
    ECDSAValidator,
} from "../../typechain-types";
import { deployVersaWallet, getUserOpHash } from "../utils";
import { enablePlugin, execute } from "../base/utils";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { AbiCoder, RLP, arrayify, hexConcat, hexlify, keccak256, parseEther } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import * as utils from "./sessionKeyUtil";
import { ANY, EQ, GT, LT, NE, AND, OR } from "./sessionKeyUtil";

export interface SpendingLimit {
    token: string;
    allowance: BigNumber | number;
}

export interface Permission {
    sessionRoot: string;
    paymaster: string;
    validUntil: number;
    validAfter: number;
    gasRemaining: BigNumber;
    timesRemaining: BigNumber;
}

const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

// test for sessionkeyvalidator
describe("SessionKeyValidator", function () {
    let sessionKeyValidator: MockSessionKeyValidator;
    let owner: SignerWithAddress;
    let operator: SignerWithAddress;
    let wallet: VersaWallet;
    let entryPoint: SignerWithAddress;
    let mockValidator: MockValidator;
    let ecdsaValidator: ECDSAValidator;
    let mockERC20: MockToken;

    const abiCoder = new AbiCoder();

    async function deployfixture() {
        const [entryPoint, owner, operator] = await ethers.getSigners();
        const sessionKeyValidator = await new MockSessionKeyValidator__factory(owner).deploy();
        const mockValidator = await new MockValidator__factory(owner).deploy();
        const ecdsaValidator = await new ECDSAValidator__factory(owner).deploy();

        const wallet = await deployVersaWallet({
            signer: entryPoint,
            entryPoint: entryPoint.address,
            sudoValidatorAddr: mockValidator.address,
        });

        await enablePlugin({
            executor: wallet,
            plugin: ecdsaValidator.address,
            selector: "enableValidator",
            initData: abiCoder.encode(["address"], [owner.address]),
        });

        await enablePlugin({
            executor: wallet,
            plugin: sessionKeyValidator.address,
            selector: "enableValidator",
        });

        const mockERC20 = await new MockToken__factory(owner).deploy("Mock ERC20", "MERC20");
        return { sessionKeyValidator, owner, operator, entryPoint, wallet, mockValidator, ecdsaValidator, mockERC20 };
    }

    describe("SessionKeyValidator basic set and get functions", function () {
        beforeEach(async function () {
            let fixture = await loadFixture(deployfixture);
            sessionKeyValidator = fixture.sessionKeyValidator;
            owner = fixture.owner;
            operator = fixture.operator;
            entryPoint = fixture.entryPoint;
            wallet = fixture.wallet;
            mockValidator = fixture.mockValidator;
            mockERC20 = fixture.mockERC20;
        });

        it("should set operator permission", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [parseEther("1").toHexString()])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address, uint256)",
                allowedArguments: allowedArguments,
            });

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const sessionRoot = tree.root;

            let permission: Permission = {
                sessionRoot: sessionRoot,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: BigNumber.from(0),
                timesRemaining: BigNumber.from(0),
            };

            let data = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            await expect(
                execute({
                    executor: wallet,
                    to: sessionKeyValidator.address,
                    data: data,
                })
            )
                .to.emit(sessionKeyValidator, "OperatorPermissionSet")
                .withArgs(wallet.address, operator.address, [
                    permission.sessionRoot,
                    permission.paymaster,
                    permission.validUntil,
                    permission.validAfter,
                    permission.gasRemaining,
                    permission.timesRemaining,
                ]);
            let permissionRes = await sessionKeyValidator.getOperatorPermission(wallet.address, operator.address);
            expect(permissionRes.sessionRoot).to.equal(sessionRoot);
            expect(permissionRes.paymaster).to.equal(ethers.constants.AddressZero);
            expect(permissionRes.validUntil).to.equal(0);
            expect(permissionRes.validAfter).to.equal(0);
            expect(permissionRes.gasRemaining).to.equal(0);
            expect(permissionRes.timesRemaining).to.equal(0);

            permission = {
                sessionRoot: sessionRoot,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: utils.MAX_UINT128,
                timesRemaining: utils.MAX_UINT128,
            };

            data = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            await expect(
                execute({
                    executor: wallet,
                    to: sessionKeyValidator.address,
                    data: data,
                })
            )
                .to.emit(sessionKeyValidator, "OperatorPermissionSet")
                .withArgs(wallet.address, operator.address, [
                    permission.sessionRoot,
                    permission.paymaster,
                    permission.validUntil,
                    permission.validAfter,
                    permission.gasRemaining,
                    permission.timesRemaining,
                ]);
            permissionRes = await sessionKeyValidator.getOperatorPermission(wallet.address, operator.address);
            expect(permissionRes.sessionRoot).to.equal(sessionRoot);
            expect(permissionRes.paymaster).to.equal(ethers.constants.AddressZero);
            expect(permissionRes.validUntil).to.equal(0);
            expect(permissionRes.validAfter).to.equal(0);
            expect(permissionRes.gasRemaining).to.equal(permission.gasRemaining);
            expect(permissionRes.timesRemaining).to.equal(permission.timesRemaining);
        });
    });

    describe("Operator spending allowance", function () {
        beforeEach(async function () {
            let fixture = await loadFixture(deployfixture);
            sessionKeyValidator = fixture.sessionKeyValidator;
            owner = fixture.owner;
            operator = fixture.operator;
            entryPoint = fixture.entryPoint;
            wallet = fixture.wallet;
            mockValidator = fixture.mockValidator;
            mockERC20 = fixture.mockERC20;
        });

        it("should set operator allowance", async function () {
            let nativeTokenConfig: SpendingLimit = {
                token: ethers.constants.AddressZero,
                allowance: parseEther("100"),
            };
            let erc20TokenConfig: SpendingLimit = {
                token: mockERC20.address,
                allowance: parseEther("100"),
            };
            let configs = [nativeTokenConfig, erc20TokenConfig];
            let data = sessionKeyValidator.interface.encodeFunctionData("batchSetAllowance", [
                operator.address,
                configs,
            ]);
            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: data,
            });
            let nativeTokenAllowance = await sessionKeyValidator.getAllowance(
                wallet.address,
                operator.address,
                ethers.constants.AddressZero
            );
            let erc20TokenAllowance = await sessionKeyValidator.getAllowance(
                wallet.address,
                operator.address,
                mockERC20.address
            );
            expect(nativeTokenAllowance).to.equal(nativeTokenConfig.allowance);
            expect(erc20TokenAllowance).to.equal(erc20TokenConfig.allowance);
        });

        it("should check native token allowance", async function () {
            let nativeTokenConfig: SpendingLimit = {
                token: ethers.constants.AddressZero,
                allowance: 100,
            };
            let configs = [nativeTokenConfig];
            let data = sessionKeyValidator.interface.encodeFunctionData("batchSetAllowance", [
                operator.address,
                configs,
            ]);
            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: data,
            });

            await sessionKeyValidator.checkAllowance(wallet.address, operator.address, mockERC20.address, "0x", 1);

            let allowance = await sessionKeyValidator.getAllowance(
                wallet.address,
                operator.address,
                ethers.constants.AddressZero
            );
            expect(allowance).to.be.equal(99);

            await expect(
                sessionKeyValidator.checkAllowance(
                    wallet.address,
                    operator.address,
                    ethers.constants.AddressZero,
                    "0x",
                    100
                )
            ).to.be.revertedWith("OperatorAllowance: token overspending");
        });

        it("should check erc20 token allowance", async function () {
            let nativeTokenConfig: SpendingLimit = {
                token: mockERC20.address,
                allowance: 100,
            };
            let configs = [nativeTokenConfig];
            let data = sessionKeyValidator.interface.encodeFunctionData("batchSetAllowance", [
                operator.address,
                configs,
            ]);
            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: data,
            });

            let executeData1 = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 1]);

            let executeData2 = mockERC20.interface.encodeFunctionData("transferFrom", [
                wallet.address,
                operator.address,
                1,
            ]);

            let executeData3 = mockERC20.interface.encodeFunctionData("transferFrom", [
                wallet.address,
                operator.address,
                99,
            ]);

            await sessionKeyValidator.checkAllowance(
                wallet.address,
                operator.address,
                mockERC20.address,
                executeData1,
                0
            );

            let allowance = await sessionKeyValidator.getAllowance(wallet.address, operator.address, mockERC20.address);
            expect(allowance).to.be.equal(99);

            await sessionKeyValidator.checkAllowance(
                wallet.address,
                operator.address,
                mockERC20.address,
                executeData2,
                0
            );

            allowance = await sessionKeyValidator.getAllowance(wallet.address, operator.address, mockERC20.address);
            expect(allowance).to.be.equal(98);

            await expect(
                sessionKeyValidator.checkAllowance(wallet.address, operator.address, mockERC20.address, executeData3, 0)
            ).to.be.revertedWith("OperatorAllowance: token overspending");
        });
    });

    describe("Check rlp arguments", function () {
        beforeEach(async function () {
            let fixture = await loadFixture(deployfixture);
            sessionKeyValidator = fixture.sessionKeyValidator;
            owner = fixture.owner;
            operator = fixture.operator;
            entryPoint = fixture.entryPoint;
            wallet = fixture.wallet;
            mockValidator = fixture.mockValidator;
            mockERC20 = fixture.mockERC20;
        });

        it("should revert if data length is not equal to rlpData length", async function () {
            let allowedArgument = new utils.argumentItem(EQ, "uint256", parseEther("1"));
            await expect(
                sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([]),
                    parseEther("1")
                )
            ).to.revertedWith("Invalid arguments length");
        });

        it("should reject invalid prefix", async function () {
            await expect(
                sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([["0x07", abiCoder.encode(["uint256"], [parseEther("1")])]]),
                    RLP.encode([abiCoder.encode(["uint256"], [parseEther("1")])]),
                    parseEther("1")
                )
            ).to.be.revertedWith("Invalid calldata prefix");
        });

        it("should validate value", async function () {
            let allowedArgument = new utils.argumentItem(EQ, "uint256", parseEther("1"));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([allowedArgument.abiItem]),
                    allowedArgument.value
                )
            ).to.be.equal(true);

            allowedArgument = new utils.argumentItem(EQ, "uint256", parseEther("1"));
            await expect(
                sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([allowedArgument.abiItem]),
                    0
                )
            ).to.revertedWith("msg.value not corresponding to parsed value");
        });

        it("should validate EQ", async function () {
            let allowedArgument = new utils.argumentItem(EQ, "uint256", parseEther("1"));
            let actualArgument = new utils.argumentItem(EQ, "uint256", 0);
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(false);

            allowedArgument = new utils.argumentItem(EQ, "uint256", ethers.constants.MaxUint256);
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([allowedArgument.abiItem]),
                    allowedArgument.value
                )
            ).to.be.equal(true);
        });

        it("should validate NE", async function () {
            let allowedArgument = new utils.argumentItem(NE, "uint256", parseEther("1"));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([allowedArgument.abiItem]),
                    allowedArgument.value
                )
            ).to.be.equal(false);

            allowedArgument = new utils.argumentItem(NE, "uint256", parseEther("1"));
            let actualArgument = new utils.argumentItem(NE, "uint256", 0);
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(true);
        });

        it("should validate GT", async function () {
            let allowedArgument = new utils.argumentItem(GT, "uint256", parseEther("1"));
            let actualArgument = new utils.argumentItem(GT, "uint256", 0);
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(false);

            allowedArgument = new utils.argumentItem(GT, "uint256", parseEther("1"));
            actualArgument = new utils.argumentItem(GT, "uint256", parseEther("1"));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(false);

            allowedArgument = new utils.argumentItem(GT, "uint256", parseEther("1"));
            actualArgument = new utils.argumentItem(GT, "uint256", parseEther("1").add(1));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(true);
        });

        it("should validate LT", async function () {
            let allowedArgument = new utils.argumentItem(LT, "uint256", parseEther("1"));
            let actualArgument = new utils.argumentItem(LT, "uint256", parseEther("1"));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(false);

            allowedArgument = new utils.argumentItem(LT, "uint256", parseEther("1"));
            actualArgument = new utils.argumentItem(LT, "uint256", parseEther("1").add(1));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(false);

            allowedArgument = new utils.argumentItem(LT, "uint256", parseEther("1"));
            actualArgument = new utils.argumentItem(LT, "uint256", parseEther("1").sub(1));
            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([allowedArgument.rlpItem]),
                    RLP.encode([actualArgument.abiItem]),
                    actualArgument.value
                )
            ).to.be.equal(true);
        });

        it("should validate AND", async function () {
            // 100 < value < 200
            let subArgument1 = new utils.argumentItem(GT, "uint256", 100);
            let subArgument2 = new utils.argumentItem(LT, "uint256", 200);

            let actualArgument1 = new utils.argumentItem(EQ, "uint256", 201);
            let actualArgument2 = new utils.argumentItem(EQ, "uint256", 99);
            let actualArgument3 = new utils.argumentItem(EQ, "uint256", 150);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([[AND, [subArgument1.rlpItem, subArgument2.rlpItem]]]),
                    RLP.encode([actualArgument1.abiItem]),
                    actualArgument1.value
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([[AND, [subArgument1.rlpItem, subArgument2.rlpItem]]]),
                    RLP.encode([actualArgument2.abiItem]),
                    actualArgument2.value
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([[AND, [subArgument1.rlpItem, subArgument2.rlpItem]]]),
                    RLP.encode([actualArgument3.abiItem]),
                    actualArgument3.value
                )
            ).to.be.equal(true);
        });

        it("should validate OR", async function () {
            // a < 100 or a > 200
            let subArgument1 = new utils.argumentItem(LT, "uint256", 100);
            let subArgument2 = new utils.argumentItem(GT, "uint256", 200);

            let actualArgument1 = new utils.argumentItem(EQ, "uint256", 150);
            let actualArgument2 = new utils.argumentItem(EQ, "uint256", 99);
            let actualArgument3 = new utils.argumentItem(EQ, "uint256", 201);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([[OR, [subArgument1.rlpItem, subArgument2.rlpItem]]]),
                    RLP.encode([actualArgument1.abiItem]),
                    actualArgument1.value
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([[OR, [subArgument1.rlpItem, subArgument2.rlpItem]]]),
                    RLP.encode([actualArgument2.abiItem]),
                    actualArgument2.value
                )
            ).to.be.equal(true);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([[OR, [subArgument1.rlpItem, subArgument2.rlpItem]]]),
                    RLP.encode([actualArgument3.abiItem]),
                    actualArgument3.value
                )
            ).to.be.equal(true);
        });

        it("should validate multi-arguments", async function () {
            let allowedArgument1 = new utils.argumentItem(GT, "uint256", 100);
            let allowedArgument2 = new utils.argumentItem(LT, "uint256", 100);
            let allowedArgument3 = new utils.argumentItem(EQ, "string", "Hello world");
            let allowedArgument4 = new utils.argumentItem(EQ, "bytes", "0x323232");
            let allowedArgument5 = new utils.argumentItem(ANY, "address", ethers.constants.AddressZero);

            let actualArgument1 = new utils.argumentItem(EQ, "uint256", 101);
            let actualArgument2 = new utils.argumentItem(EQ, "uint256", 99);
            let actualArgument3 = new utils.argumentItem(EQ, "string", "Hello world");
            let actualArgument4 = new utils.argumentItem(EQ, "bytes", "0x323232");
            let actualArgument5 = new utils.argumentItem(ANY, "address", ethers.constants.AddressZero);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        allowedArgument1.rlpItem,
                        allowedArgument2.rlpItem,
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1.abiItem,
                        actualArgument2.abiItem,
                        actualArgument3.abiItem,
                        actualArgument4.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1.abiItem
                )
            ).to.be.equal(true);
        });

        it("should validate multi-arguments with nested arguments", async function () {
            // 100 < allowedArgument1 < 200
            let subAllowedArgument1_1 = new utils.argumentItem(GT, "uint256", 100);
            let subAllowedArgument1_2 = new utils.argumentItem(LT, "uint256", 200);

            // allowedArgument2 > 200 || allowedArgument2 = 100
            let subAllowedArgument2_1 = new utils.argumentItem(GT, "uint256", 200);
            let subAllowedArgument2_2 = new utils.argumentItem(EQ, "uint256", 100);

            let allowedArgument3 = new utils.argumentItem(EQ, "string", "Hello world");
            let allowedArgument4 = new utils.argumentItem(EQ, "bytes", "0x323232");
            let allowedArgument5 = new utils.argumentItem(ANY, "address", ethers.constants.AddressZero);

            let actualArgument1_1 = new utils.argumentItem(EQ, "uint256", 101);
            let actualArgument1_2 = new utils.argumentItem(EQ, "uint256", 199);
            let actualArgument1_3 = new utils.argumentItem(EQ, "uint256", 99);
            let actualArgument1_4 = new utils.argumentItem(EQ, "uint256", 201);

            let actualArgument2_1 = new utils.argumentItem(EQ, "uint256", 201);
            let actualArgument2_2 = new utils.argumentItem(EQ, "uint256", 100);
            let actualArgument2_3 = new utils.argumentItem(EQ, "uint256", 199);

            let actualArgument3_1 = new utils.argumentItem(EQ, "string", "Hello world");
            let actualArgument3_2 = new utils.argumentItem(EQ, "string", "Hello weirdo");

            let actualArgument4_1 = new utils.argumentItem(EQ, "bytes", "0x323232");
            let actualArgument4_2 = new utils.argumentItem(EQ, "bytes", "0x232323");

            let actualArgument5 = new utils.argumentItem(ANY, "address", ethers.constants.AddressZero);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_1.abiItem,
                        actualArgument2_1.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_1.abiItem
                )
            ).to.be.equal(true);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_2.abiItem,
                        actualArgument2_1.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_2.abiItem
                )
            ).to.be.equal(true);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_3.abiItem,
                        actualArgument2_1.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_3.abiItem
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_4.abiItem,
                        actualArgument2_1.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_4.abiItem
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_1.abiItem,
                        actualArgument2_2.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_1.abiItem
                )
            ).to.be.equal(true);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_1.abiItem,
                        actualArgument2_3.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_1.abiItem
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_1.abiItem,
                        actualArgument2_1.abiItem,
                        actualArgument3_2.abiItem,
                        actualArgument4_1.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_1.abiItem
                )
            ).to.be.equal(false);

            expect(
                await sessionKeyValidator.isAllowedCalldata(
                    RLP.encode([
                        [AND, [subAllowedArgument1_1.rlpItem, subAllowedArgument1_2.rlpItem]],
                        [OR, [subAllowedArgument2_1.rlpItem, subAllowedArgument2_2.rlpItem]],
                        allowedArgument3.rlpItem,
                        allowedArgument4.rlpItem,
                        allowedArgument5.rlpItem,
                    ]),
                    RLP.encode([
                        actualArgument1_1.abiItem,
                        actualArgument2_1.abiItem,
                        actualArgument3_1.abiItem,
                        actualArgument4_2.abiItem,
                        actualArgument5.abiItem,
                    ]),
                    actualArgument1_1.abiItem
                )
            ).to.be.equal(false);
        });
    });

    describe("SessionKeyValidator validate function", function () {
        beforeEach(async function () {
            let fixture = await loadFixture(deployfixture);
            sessionKeyValidator = fixture.sessionKeyValidator;
            owner = fixture.owner;
            operator = fixture.operator;
            entryPoint = fixture.entryPoint;
            wallet = fixture.wallet;
            mockValidator = fixture.mockValidator;
            ecdsaValidator = fixture.ecdsaValidator;
            mockERC20 = fixture.mockERC20;
        });

        it("should verify merkle root", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [parseEther("1").toHexString()])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address,uint256)",
                allowedArguments: allowedArguments,
            });

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const root = tree.root;

            let proof = tree.getProof(session);
            let sessionData = {
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                allowedArguments: RLP.encode(allowedArguments),
            };

            expect(await sessionKeyValidator.testValidateSessionRoot(proof, root, sessionData)).to.be.equal(true);
        });

        it("should validate paymaster", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [parseEther("1").toHexString()])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address, uint256)",
                allowedArguments: allowedArguments,
            });

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const sessionRoot = tree.root;

            let paymaster = operator.address;

            let permission: Permission = {
                sessionRoot: sessionRoot,
                paymaster,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: BigNumber.from(0),
                timesRemaining: BigNumber.from(0),
            };

            let data = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: data,
            });

            await expect(
                sessionKeyValidator.testValidatePaymaster(
                    wallet.address,
                    operator.address,
                    hexConcat([ethers.constants.AddressZero, "0x0000"])
                )
            ).to.be.revertedWith("SessionKeyValidator: invalid paymaster");

            await expect(
                sessionKeyValidator.testValidatePaymaster(wallet.address, operator.address, "0x")
            ).to.be.revertedWith("SessionKeyValidator: invalid paymaster");

            expect(
                await sessionKeyValidator.testValidatePaymaster(
                    wallet.address,
                    operator.address,
                    hexConcat([paymaster, "0x0000"])
                )
            ).to.be.equal(true);
        });

        it("validate arguments: should reject invalid `to` address", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["uint256 "], [0])], // native token address
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [100])], // transfer: value
            ];

            let rlpCalldata = RLP.encode([
                abiCoder.encode(["uint256"], [0]),
                abiCoder.encode(["address"], [operator.address]),
                abiCoder.encode(["uint256"], [100]),
            ]);
            let rlpAllowedArguments = RLP.encode(allowedArguments);

            let session = {
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address, uint256)").substring(0, 10),
                allowedArguments: rlpAllowedArguments,
            };

            let data = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 100]);

            await expect(
                sessionKeyValidator.testCheckArguments(session, ethers.constants.AddressZero, data, 0, rlpCalldata)
            ).to.be.revertedWith("SessionKeyValidator: invalid to");
        });

        it("validate arguments: should reject invalid rlpCalldata", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["uint256 "], [0])], // native token address
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [100])], // transfer: value
            ];

            let rlpCalldata = RLP.encode([
                abiCoder.encode(["uint256"], [0]),
                abiCoder.encode(["address"], [operator.address]),
                abiCoder.encode(["uint256"], [10]),
            ]);
            let rlpAllowedArguments = RLP.encode(allowedArguments);

            let session = {
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address, uint256)").substring(0, 10),
                allowedArguments: rlpAllowedArguments,
            };

            let data = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 100]);

            await expect(
                sessionKeyValidator.testCheckArguments(session, mockERC20.address, data, 0, rlpCalldata)
            ).to.be.revertedWith("SessionKeyValidator: rlpCalldata is not equally encoded from execution data");
        });

        it("validate arguments: should reject invalid function selector", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["uint256 "], [0])], // native token address
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [100])], // transfer: value
            ];

            let rlpCalldata = RLP.encode([
                abiCoder.encode(["uint256"], [0]),
                abiCoder.encode(["address"], [operator.address]),
                abiCoder.encode(["uint256"], [10]),
            ]);
            let rlpAllowedArguments = RLP.encode(allowedArguments);

            let session = {
                to: mockERC20.address,
                selector: ethers.utils.id("approve(address, uint256)").substring(0, 10),
                allowedArguments: rlpAllowedArguments,
            };

            let data = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 10]);

            await expect(
                sessionKeyValidator.testCheckArguments(session, mockERC20.address, data, 0, rlpCalldata)
            ).to.be.revertedWith("SessionKeyValidator: invalid selector");
        });

        it("should check permission usage", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [parseEther("1").toHexString()])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address, uint256)",
                allowedArguments: allowedArguments,
            });

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const sessionRoot = tree.root;

            let permission: Permission = {
                sessionRoot: sessionRoot,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: BigNumber.from(2500),
                timesRemaining: BigNumber.from(1),
            };

            let data = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: data,
            });

            let userOp = {
                sender: wallet.address,
                nonce: 0,
                initCode: "0x",
                callData: "0x",
                callGasLimit: 100,
                verificationGasLimit: 100,
                preVerificationGas: 100,
                maxFeePerGas: 5,
                maxPriorityFeePerGas: 5,
                paymasterAndData: "0x",
                signature: "0x",
            };

            // gas cost  = (100 + 100 + 100) * 5 = 1500
            let gasCost =
                (userOp.callGasLimit + userOp.verificationGasLimit * 1 + userOp.preVerificationGas) *
                userOp.maxFeePerGas;

            await sessionKeyValidator.testCheckAndUpdateUsage(operator.address, userOp, 1);

            let permissionRes = await sessionKeyValidator.getOperatorPermission(wallet.address, operator.address);
            expect(permissionRes.gasRemaining).to.equal(permission.gasRemaining.sub(gasCost));
            expect(permissionRes.timesRemaining).to.equal(permission.timesRemaining.sub(1));
        });

        it("should reject unenough permission usage", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [parseEther("1").toHexString()])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address, uint256)",
                allowedArguments: allowedArguments,
            });

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const sessionRoot = tree.root;

            let permission: Permission = {
                sessionRoot: sessionRoot,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: BigNumber.from(2500),
                timesRemaining: BigNumber.from(1),
            };

            let data = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: data,
            });

            let userOp = {
                sender: wallet.address,
                nonce: 0,
                initCode: "0x",
                callData: "0x",
                callGasLimit: 100,
                verificationGasLimit: 500,
                preVerificationGas: 100,
                maxFeePerGas: 5,
                maxPriorityFeePerGas: 5,
                paymasterAndData: "0x",
                signature: "0x",
            };

            // gas cost  = (100 + 100 + 100) * 5 = 1500
            let gasCost =
                (userOp.callGasLimit + userOp.verificationGasLimit * 1 + userOp.preVerificationGas) *
                userOp.maxFeePerGas;

            await expect(sessionKeyValidator.testCheckAndUpdateUsage(operator.address, userOp, 1)).to.be.revertedWith(
                "SessionKeyValidator: exceed usage"
            );

            userOp.verificationGasLimit = 100;
            await expect(sessionKeyValidator.testCheckAndUpdateUsage(operator.address, userOp, 2)).to.be.revertedWith(
                "SessionKeyValidator: exceed usage"
            );
        });

        it("should validate userOp: normalExecute", async function () {
            // set operator permission
            let allowedArguments = [
                [EQ, abiCoder.encode(["uint256"], [0])],
                [EQ, abiCoder.encode(["address"], [operator.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [100])], // transfer: value
            ];

            let erc20TokenConfig: SpendingLimit = {
                token: mockERC20.address,
                allowance: 100,
            };

            let session = [
                mockERC20.address,
                ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                RLP.encode(allowedArguments),
            ];

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const sessionRoot = tree.root;
            const proof = tree.getProof(session);

            const permission: Permission = {
                sessionRoot: sessionRoot,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: MAX_UINT128,
                timesRemaining: MAX_UINT128,
            };

            const permitData = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            const allowanceData = sessionKeyValidator.interface.encodeFunctionData("setAllowance", [
                operator.address,
                erc20TokenConfig,
            ]);

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: permitData,
            });

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: allowanceData,
            });

            const permissionRes = await sessionKeyValidator.getOperatorPermission(wallet.address, operator.address);
            expect(permissionRes.sessionRoot).to.equal(permission.sessionRoot);
            expect(permissionRes.paymaster).to.equal(permission.paymaster);
            expect(permissionRes.validUntil).to.equal(permission.validUntil);
            expect(permissionRes.validAfter).to.equal(permission.validAfter);
            expect(permissionRes.gasRemaining).to.equal(permission.gasRemaining);
            expect(permissionRes.timesRemaining).to.equal(permission.timesRemaining);

            //  mint erc20
            await mockERC20.mint(wallet.address, parseEther("100"));
            const transferData = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 100]);
            const calldata = wallet.interface.encodeFunctionData("normalExecute", [
                mockERC20.address,
                0,
                transferData,
                0,
            ]);
            const rlpTransaferData = RLP.encode([
                abiCoder.encode(["uint256"], [0]),
                abiCoder.encode(["address"], [operator.address]),
                abiCoder.encode(["uint256"], [100]),
            ]);

            let op = {
                sender: wallet.address,
                nonce: 0,
                initCode: "0x",
                callData: calldata,
                callGasLimit: 2150000,
                verificationGasLimit: 2150000,
                preVerificationGas: 2150000,
                maxFeePerGas: 500,
                maxPriorityFeePerGas: 500,
                paymasterAndData: "0x",
                signature: "0x",
            };

            const chainId = 1;
            const userOpHash = getUserOpHash(op, entryPoint.address, chainId);

            const operatorSignature = await operator.signMessage(arrayify(userOpHash));

            const enmptyPermission: Permission = {
                sessionRoot: ethers.constants.HashZero,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: BigNumber.from(0),
                timesRemaining: BigNumber.from(0),
            };

            const signature = utils.getSessionSigleExecuteSignature(
                sessionKeyValidator.address,
                proof,
                operator.address,
                session,
                rlpTransaferData,
                operatorSignature,
            );
            op.signature = signature;
            const validationData = await wallet.callStatic.validateUserOp(op, userOpHash, 0);
            expect(validationData).to.be.equal(0);
        });

        it("should validate userOp: batchNormalExecute", async function () {
            // set operator permission
            let allowedArguments1 = [
                [EQ, abiCoder.encode(["uint256"], [0])],
                [EQ, abiCoder.encode(["address"], [operator.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [100])], // transfer: value
            ];

            let allowedArguments2 = [[EQ, abiCoder.encode(["uint256"], [100])]];

            let erc20TokenConfig: SpendingLimit = {
                token: mockERC20.address,
                allowance: 100,
            };

            let nativeTokenConfig: SpendingLimit = {
                token: ethers.constants.AddressZero,
                allowance: 100,
            };

            let session1 = [
                mockERC20.address,
                ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                RLP.encode(allowedArguments1),
            ];

            let session2 = [
                operator.address,
                "0x00000000", // fallback
                RLP.encode(allowedArguments2),
            ];

            let leaves = [session1, session2];
            const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
            const sessionRoot = tree.root;
            const proof1 = tree.getProof(session1);
            const proof2 = tree.getProof(session2);

            const permission: Permission = {
                sessionRoot: sessionRoot,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: MAX_UINT128,
                timesRemaining: MAX_UINT128,
            };

            const permitData = sessionKeyValidator.interface.encodeFunctionData("setOperatorPermission", [
                operator.address,
                permission,
            ]);

            const allowanceData = sessionKeyValidator.interface.encodeFunctionData("batchSetAllowance", [
                operator.address,
                [erc20TokenConfig, nativeTokenConfig],
            ]);

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: permitData,
            });

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: allowanceData,
            });

            const permissionRes = await sessionKeyValidator.getOperatorPermission(wallet.address, operator.address);
            expect(permissionRes.sessionRoot).to.equal(permission.sessionRoot);
            expect(permissionRes.paymaster).to.equal(permission.paymaster);
            expect(permissionRes.validUntil).to.equal(permission.validUntil);
            expect(permissionRes.validAfter).to.equal(permission.validAfter);
            expect(permissionRes.gasRemaining).to.equal(permission.gasRemaining);
            expect(permissionRes.timesRemaining).to.equal(permission.timesRemaining);

            //  mint erc20
            await mockERC20.mint(wallet.address, parseEther("100"));
            const transferERC20Data = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 100]);
            const transferNativeData = "0x";
            const calldata = wallet.interface.encodeFunctionData("batchNormalExecute", [
                [mockERC20.address, operator.address],
                [0, 100],
                [transferERC20Data, transferNativeData],
                [0, 0],
            ]);
            const rlpERC20TransaferData = RLP.encode([
                abiCoder.encode(["uint256"], [0]),
                abiCoder.encode(["address"], [operator.address]),
                abiCoder.encode(["uint256"], [100]),
            ]);
            const rlpValueTransferData = RLP.encode([abiCoder.encode(["uint256"], [100])]);

            let op = {
                sender: wallet.address,
                nonce: 0,
                initCode: "0x",
                callData: calldata,
                callGasLimit: 2150000,
                verificationGasLimit: 2150000,
                preVerificationGas: 2150000,
                maxFeePerGas: 500,
                maxPriorityFeePerGas: 500,
                paymasterAndData: "0x",
                signature: "0x",
            };

            const chainId = 1;
            const userOpHash = getUserOpHash(op, entryPoint.address, chainId);

            const operatorSignature = await operator.signMessage(arrayify(userOpHash));

            const enmptyPermission: Permission = {
                sessionRoot: ethers.constants.HashZero,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                gasRemaining: BigNumber.from(0),
                timesRemaining: BigNumber.from(0),
            };

            const signature = utils.getSessionBatchExecuteSignature(
                sessionKeyValidator.address,
                [proof1, proof2],
                operator.address,
                [session1, session2],
                [rlpERC20TransaferData, rlpValueTransferData],
                operatorSignature
            );
            op.signature = signature;
            const validationData = await wallet.callStatic.validateUserOp(op, userOpHash, 0);
            expect(validationData).to.be.equal(0);
        });

        it("should reject non-normal execute", async function () {
            const iface = new ethers.utils.Interface(["function test(uint)"]);
            const calldata = iface.encodeFunctionData("test", [0]);

            let op = {
                sender: wallet.address,
                nonce: 0,
                initCode: "0x",
                callData: calldata,
                callGasLimit: 2150000,
                verificationGasLimit: 2150000,
                preVerificationGas: 2150000,
                maxFeePerGas: 500,
                maxPriorityFeePerGas: 500,
                paymasterAndData: "0x",
                signature: hexConcat([sessionKeyValidator.address, "0x"]),
            };

            const userOpHash = getUserOpHash(op, entryPoint.address, 1);
            expect(await wallet.connect(entryPoint).callStatic.validateUserOp(op, userOpHash, 0)).to.be.equal(1);
        });
    });
});
