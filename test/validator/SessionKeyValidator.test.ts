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
import * as utils from "./sessionKeyUtil";
import { ANY, EQ, GT, LT, NE, AND, OR, buildSessionTree, getSession } from "./sessionKeyUtil";

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

        it("should set session root", async function () {
            let allowedArguments = [
                [EQ, abiCoder.encode(["address"], [mockERC20.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [parseEther("1").toHexString()])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address,uint256)",
                allowedArguments: allowedArguments,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                timesLimit: 0,
            });

            let session2 = {
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                allowedArguments: RLP.encode(allowedArguments),
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                timesLimit: 0,
            };

            let leaves = [session];
            const tree = StandardMerkleTree.of(leaves, [
                "address",
                "bytes4",
                "bytes",
                "address",
                "uint48",
                "uint48",
                "uint256",
            ]);
            const sessionRoot = tree.root;

            let data = sessionKeyValidator.interface.encodeFunctionData("setSessionRoot", [
                operator.address,
                sessionRoot,
            ]);

            await expect(
                execute({
                    executor: wallet,
                    to: sessionKeyValidator.address,
                    data: data,
                })
            )
                .to.emit(sessionKeyValidator, "SessionRootSet")
                .withArgs(wallet.address, operator.address, sessionRoot);
            let sessionRootRes = await sessionKeyValidator.getSesionRoot(wallet.address, operator.address);
            expect(sessionRootRes).to.equal(sessionRoot);
        });

        it("should set operator remaining gas", async function () {
            let data = sessionKeyValidator.interface.encodeFunctionData("setOperatorRemainingGas", [
                operator.address,
                parseEther("1"),
            ]);

            await expect(
                execute({
                    executor: wallet,
                    to: sessionKeyValidator.address,
                    data: data,
                })
            )
                .to.emit(sessionKeyValidator, "OperatorRemainingGasSet")
                .withArgs(wallet.address, operator.address, parseEther("1"));
            let operatorRemainingGas = await sessionKeyValidator.getOperatorRemainingGas(
                wallet.address,
                operator.address
            );
            expect(operatorRemainingGas).to.equal(parseEther("1"));
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
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                timesLimit: 0,
            });

            let leaves = [session];
            const tree = buildSessionTree(leaves);
            const root = tree.root;

            let proof = tree.getProof(session);
            let sessionData = {
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                allowedArguments: RLP.encode(allowedArguments),
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                timesLimit: 0,
            };

            expect(await sessionKeyValidator.testValidateSessionRoot(proof, root, sessionData)).to.be.equal(true);
        });

        it("should validate paymaster", async function () {
            let paymaster = ethers.constants.AddressZero;
            let actualPaymaster = wallet.address;
            expect(await sessionKeyValidator.testValidatePaymaster(paymaster, actualPaymaster)).to.be.equal(true);

            paymaster = wallet.address;
            actualPaymaster = operator.address;
            await expect(sessionKeyValidator.testValidatePaymaster(paymaster, actualPaymaster)).to.be.revertedWith(
                "SessionKeyValidator: invalid paymaster"
            );

            paymaster = wallet.address;
            actualPaymaster = wallet.address;
            expect(await sessionKeyValidator.testValidatePaymaster(paymaster, actualPaymaster)).to.be.equal(true);
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

            let session = getSession({
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                allowedArguments: RLP.encode(allowedArguments),
            });

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

            let session = getSession({
                to: mockERC20.address,
                selector: ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                allowedArguments: RLP.encode(allowedArguments),
            });

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

            let session = getSession({
                to: mockERC20.address,
                selector: ethers.utils.id("transfering(address,uint256)").substring(0, 10),
                allowedArguments: RLP.encode(allowedArguments),
            });

            let data = mockERC20.interface.encodeFunctionData("transfer", [operator.address, 10]);

            await expect(
                sessionKeyValidator.testCheckArguments(session, mockERC20.address, data, 0, rlpCalldata)
            ).to.be.revertedWith("SessionKeyValidator: invalid selector");
        });

        it("should check operator gas usage", async function () {
            let data = sessionKeyValidator.interface.encodeFunctionData("setOperatorRemainingGas", [
                operator.address,
                2500,
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

            await sessionKeyValidator.testValidateOperatorGasUsage(operator.address, userOp);

            let remainingGas = await sessionKeyValidator.getOperatorRemainingGas(wallet.address, operator.address);
            expect(remainingGas).to.be.equal(2500 - gasCost);

            userOp.verificationGasLimit = 0;
            await sessionKeyValidator.testValidateOperatorGasUsage(operator.address, userOp);

            remainingGas = await sessionKeyValidator.getOperatorRemainingGas(wallet.address, operator.address);
            expect(remainingGas).to.be.equal(0);

            await expect(sessionKeyValidator.testValidateOperatorGasUsage(operator.address, userOp)).to.be.revertedWith(
                "SessionKeyValidator: gas fee exceeds remaining gas"
            );
        });

        it("should return right valid range", async function () {
            let validUntil1 = 100;
            let validUntil2 = 200;
            let validAfter1 = 50;
            let validAfter2 = 150;

            await expect(
                sessionKeyValidator.testGetValidationIntersection(validUntil1, validUntil2, validAfter1, validAfter2)
            ).to.revertedWith("SessionKeyValidator: invalid validation duration");

            validUntil1 = 100;
            validUntil2 = 200;
            validAfter1 = 50;
            validAfter2 = 0;

            let validRange = await sessionKeyValidator.testGetValidationIntersection(
                validUntil1,
                validUntil2,
                validAfter1,
                validAfter2
            );
            expect(validRange[0]).to.be.equal(100);
            expect(validRange[1]).to.be.equal(50);

            validUntil1 = 0;
            validUntil2 = 200;
            validAfter1 = 50;
            validAfter2 = 0;

            validRange = await sessionKeyValidator.testGetValidationIntersection(
                validUntil1,
                validUntil2,
                validAfter1,
                validAfter2
            );
            expect(validRange[0]).to.be.equal(200);
            expect(validRange[1]).to.be.equal(50);

            validUntil1 = 40;
            validUntil2 = 40;
            validAfter1 = 50;
            validAfter2 = 0;

            await expect(
                sessionKeyValidator.testGetValidationIntersection(validUntil1, validUntil2, validAfter1, validAfter2)
            ).to.be.revertedWith("SessionKeyValidator: invalid validation duration");

            validUntil1 = 0;
            validUntil2 = 0;
            validAfter1 = 50;
            validAfter2 = 0;

            validRange = await sessionKeyValidator.testGetValidationIntersection(
                validUntil1,
                validUntil2,
                validAfter1,
                validAfter2
            );
            expect(validRange[0]).to.be.equal(0);
            expect(validRange[1]).to.be.equal(50);
        });

        it("should validate userOp: normalExecute", async function () {
            // set operator permission
            let allowedArguments = [
                [EQ, abiCoder.encode(["uint256"], [0])],
                [EQ, abiCoder.encode(["address"], [operator.address])], // transfer: to
                [EQ, abiCoder.encode(["uint256"], [100])], // transfer: value
            ];

            let session = utils.buildSession({
                to: mockERC20.address,
                selector: "transfer(address,uint256)",
                allowedArguments: allowedArguments,
                paymaster: ethers.constants.AddressZero,
                validUntil: 0,
                validAfter: 0,
                timesLimit: 1,
            });

            let leaves = [session];
            const tree = buildSessionTree(leaves);
            const sessionRoot = tree.root;
            const proof = tree.getProof(session);

            const setSessionRoot = sessionKeyValidator.interface.encodeFunctionData("setSessionRoot", [
                operator.address,
                sessionRoot,
            ]);

            const gasFee = 2150000 * 3 * 500;
            const setOperatorRemainingGas = sessionKeyValidator.interface.encodeFunctionData(
                "setOperatorRemainingGas",
                [operator.address, gasFee]
            );

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: setSessionRoot,
            });

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: setOperatorRemainingGas,
            });

            const sessionRootRes = await sessionKeyValidator.getSesionRoot(wallet.address, operator.address);
            expect(sessionRootRes).to.be.equal(sessionRoot);

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
            const finalHash = keccak256(
                abiCoder.encode(["bytes32", "address"], [userOpHash, sessionKeyValidator.address])
            );

            const operatorSignature = await operator.signMessage(arrayify(finalHash));

            const signature = utils.getSessionSigleExecuteSignature(
                sessionKeyValidator.address,
                proof,
                operator.address,
                session,
                rlpTransaferData,
                operatorSignature
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

            let session1 = [
                mockERC20.address,
                ethers.utils.id("transfer(address,uint256)").substring(0, 10),
                RLP.encode(allowedArguments1),
                wallet.address, // paymaster
                50, // valid until
                0, // valid after
                1,
            ];

            let session2 = [
                operator.address,
                "0x00000000", // fallback
                RLP.encode(allowedArguments2),
                wallet.address, // paymaster
                40, // valid until
                20, // valid after
                1,
            ];

            let leaves = [session1, session2];
            const tree = buildSessionTree(leaves);
            const sessionRoot = tree.root;
            const proof1 = tree.getProof(session1);
            const proof2 = tree.getProof(session2);

            const setSessionRoot = sessionKeyValidator.interface.encodeFunctionData("setSessionRoot", [
                operator.address,
                sessionRoot,
            ]);

            const gasFee = 2150000 * 3 * 500 * 3;
            const setOperatorRemainingGas = sessionKeyValidator.interface.encodeFunctionData(
                "setOperatorRemainingGas",
                [operator.address, gasFee]
            );

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: setSessionRoot,
            });

            await execute({
                executor: wallet,
                to: sessionKeyValidator.address,
                data: setOperatorRemainingGas,
            });

            const sessionRootRes = await sessionKeyValidator.getSesionRoot(wallet.address, operator.address);
            expect(sessionRootRes).to.be.equal(sessionRoot);

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
                paymasterAndData: hexConcat([wallet.address]),
                signature: "0x",
            };

            const chainId = 1;
            const userOpHash = getUserOpHash(op, entryPoint.address, chainId);
            const finalHash = keccak256(
                abiCoder.encode(["bytes32", "address"], [userOpHash, sessionKeyValidator.address])
            );
            const operatorSignature = await operator.signMessage(arrayify(finalHash));

            const signature = utils.getSessionBatchExecuteSignature(
                sessionKeyValidator.address,
                [proof1, proof2],
                operator.address,
                [session1, session2],
                [rlpERC20TransaferData, rlpValueTransferData],
                operatorSignature
            );
            op.signature = signature;

            expect(await wallet.callStatic.validateUserOp(op, userOpHash, 0)).to.be.equal(
                utils.packValidationData(0, 40, 20)
            );
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
            await expect(wallet.connect(entryPoint).callStatic.validateUserOp(op, userOpHash, 0)).to.be.revertedWith(
                "SessionKeyValidator: invalid wallet operation"
            );
        });
    });
});
