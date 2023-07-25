import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { hexlify, hexConcat, arrayify, parseEther, parseUnits, RLP, keccak256 } from "ethers/lib/utils";
import mumbaiAddresses from "../deploy/addresses/polygonMumbai.json";
import scrollTestnetAddresses from "../deploy/addresses/scrollTestnet.json";
import { generateWalletInitCode } from "../test/utils";
import { AddressOne } from "../@safe-contracts/src";
import { estimateGas, estimateGasAndSendUserOpAndGetReceipt, generateUserOp, sendUserOp, sleep } from "./utils/bundler";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as config from "./utils/config";
import { getUserOpHash } from "../test/utils";
import axios from "axios";
import { hex } from "@openzeppelin/merkle-tree/dist/bytes";
import fs from "fs";

const bundlerURL = config.mumbaiBundlerURL;
const paymasterURL = config.mumbaiPaymasterURL;
const entryPointAddress = mumbaiAddresses.entryPoint;
const paymasterAddress = config.mumbaiPaymasterAddress;
const spendingLimitAddress = mumbaiAddresses.spendingLimitHooks;
const versaAccountFactoryAddress = mumbaiAddresses.versaAccountFactory;
const ecdsaValidator = mumbaiAddresses.ecdsaValidator;
const multisigValidator = mumbaiAddresses.multisigValidator;
const targetERC20 = config.mumbaiUSDTAddress;
const testNFTAddress = config.mumbaiTestNFTAddress;
const sessionKeyValidatorAddress = mumbaiAddresses.sessionKeyValdiator;

const salt = config.salt;

export interface SpendingLimit {
    token: string;
    allowance: BigNumber;
}

export interface Permission {
    sessionRoot: string;
    paymaster: string;
    validUntil: number;
    validAfter: number;
    gasRemaining: BigNumber;
    timesRemaining: BigNumber;
}

const ANY = hexlify(0);
const NE = hexlify(1);
const EQ = hexlify(2);
const GT = hexlify(3);
const LT = hexlify(4);
const AND = hexlify(5);
const OR = hexlify(6);

const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

export interface ConstructData {
    wallet: string;
    operator: string;
    permission: Permission;
    sessions: string[][];
    permitSignature: string;
    chainId: number;
    txData: TxData;
}

export interface TxData {
    to: string;
    value: number;
    function: string;
    data: { type: string; value: any }[];
}

async function integration_test() {
    let [signer1, signer2, signer3, signer4] = await ethers.getSigners();
    let abiCoder = new ethers.utils.AbiCoder();
    const addr = await signer1.getAddress();
    const versaAccountFactory = await ethers.getContractAt("VersaAccountFactory", versaAccountFactoryAddress);
    const validatorInitdata = abiCoder.encode(["address"], [addr]);
    let { initCode, walletAddress } = await generateWalletInitCode({
        versaFacotryAddr: versaAccountFactory.address,
        salt,
        sudoValidator: ecdsaValidator,
        sudoValidatorInitData: validatorInitdata,
    });
    const wallet = await ethers.getContractAt("VersaWallet", walletAddress);

    console.log("============deploy new wallet=================");
    let calldata = wallet.interface.encodeFunctionData("normalExecute", [signer2.address, 0, "0x", 0]);
    let userOp = await generateUserOp({ signer: signer1, walletAddress: walletAddress, callData: calldata, initCode });
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: ecdsaValidator,
        signers: [signer1],
    });

    console.log("============ sessionkey validator =============");
    const sessionKeyValidator = await ethers.getContractAt("SessionKeyValidator", sessionKeyValidatorAddress);
    console.log("enable sessionkey validator...");
    let enableSessionKeyValidator = wallet.interface.encodeFunctionData("enableValidator", [
        sessionKeyValidatorAddress,
        2,
        "0x",
    ]);
    calldata = wallet.interface.encodeFunctionData("sudoExecute", [walletAddress, 0, enableSessionKeyValidator, 0]);
    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: ecdsaValidator,
        signers: [signer1],
    });

    console.log("test using session key...");
    let operator = signer2;
    let owner = signer1;
    // set operator permission
    let allowedArguments = [
        [EQ, abiCoder.encode(["uint256"], [0])], // native token amount
        [EQ, abiCoder.encode(["address"], [operator.address])], // transfer: to
        [EQ, abiCoder.encode(["uint256"], [parseUnits("1", 6)])], // transfer: value
    ];

    let session = [
        targetERC20,
        ethers.utils.id("transfer(address,uint256)").substring(0, 10),
        RLP.encode(allowedArguments),
    ];

    let leaves = [session];
    const tree = StandardMerkleTree.of(leaves, ["address", "bytes4", "bytes"]);
    const sessionRoot = tree.root;
    const proof = [tree.getProof(session)];

    const permission: Permission = {
        sessionRoot: sessionRoot,
        paymaster: ethers.constants.AddressZero,
        validUntil: 0,
        validAfter: 0,
        gasRemaining: MAX_UINT128,
        timesRemaining: MAX_UINT128,
    };

    const erc20SpendingLimitConfig: SpendingLimit = {
        token: targetERC20,
        allowance: parseUnits("1", 6),
    };

    //  construct offchain permit
    const permissionHash = keccak256(
        abiCoder.encode(
            ["bytes32", "address", "uint48", "uint48", "uint128", "uint128"],
            [
                permission.sessionRoot,
                permission.paymaster,
                permission.validUntil,
                permission.validAfter,
                permission.gasRemaining,
                permission.timesRemaining,
            ]
        )
    );

    const spendingLimitConfigHash = keccak256(
        abiCoder.encode(["tuple(address token, uint256 allowance)[]"], [[erc20SpendingLimitConfig]])
    );

    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);
    const nonce = await sessionKeyValidator.getPermitNonce(wallet.address);
    const permitMessageHash = keccak256(
        abiCoder.encode(
            ["address", "address", "bytes32", "bytes32", "uint256", "uint256"],
            [wallet.address, operator.address, permissionHash, spendingLimitConfigHash, chainId, nonce]
        )
    );

    const siganture = await owner.signMessage(arrayify(permitMessageHash));
    const ownerSignature = hexConcat([ecdsaValidator, siganture]);
    console.log(
        "valdiate offchain permit",
        await sessionKeyValidator.validateOffchainPermit(
            wallet.address,
            operator.address,
            permissionHash,
            spendingLimitConfigHash,
            ownerSignature
        )
    );

    const targetERC20Contract = await ethers.getContractAt("IERC20", targetERC20);
    if ((await targetERC20Contract.balanceOf(walletAddress)).lt(parseUnits("2", 6))) {
        console.log("insufficient erc20 token balance, transferring...");
        let tx = await targetERC20Contract.connect(signer1).transfer(walletAddress, parseUnits("10", 6));
        await tx.wait();
    }
    const transferData = targetERC20Contract.interface.encodeFunctionData("transfer", [
        operator.address,
        parseUnits("1", 6),
    ]);
    let to = [targetERC20];
    let value = [0];
    let data = [transferData];
    let operation = [0];
    calldata = wallet.interface.encodeFunctionData("batchNormalExecute", [to, value, data, operation]);
    const rlpTransaferData = [
        RLP.encode([
            abiCoder.encode(["uint256"], [0]),
            abiCoder.encode(["address"], [operator.address]),
            abiCoder.encode(["uint256"], [parseUnits("1", 6)]),
        ]),
    ];

    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    userOp.signature = hexConcat([
        ecdsaValidator,
        "0x00",
        "0x59c044382c5418739ef913865b05f60050f8e587041548215aa595816dfbe77b26408ebd368bc51be61008aaef7b9b87479c91f9c297caf1e33e8c3b2de69a3b1c",
    ]);
    const [gas] = await estimateGas(bundlerURL, userOp, entryPointAddress);
    userOp.callGasLimit = hexlify(gas.callGasLimit);
    userOp.verificationGasLimit = hexlify(gas.verificationGas + 500000);

    const entryPoint = await ethers.getContractAt("IEntryPoint", entryPointAddress);
    let userOpHash = await entryPoint.getUserOpHash(userOp);

    console.log("userOPhash", userOpHash);

    const operatorSignature = await operator.signMessage(arrayify(userOpHash));

    const sessionToUse = [session];

    // construct signature
    const signature = hexConcat([
        sessionKeyValidatorAddress,
        abiCoder.encode(
            [
                "bytes32[][]",
                "address",
                "tuple(address, bytes4, bytes)[]",
                "bytes[]",
                "bytes",
                "bytes",
                "tuple(bytes32 sessionRoot, address paymaster, uint48 validUntil, uint48 validAfter, uint128 gasRemaining, uint128 timesRemaining)",
                "tuple(address token, uint256 allowance)[]",
            ],
            [
                proof,
                operator.address,
                sessionToUse,
                rlpTransaferData,
                operatorSignature,
                ownerSignature,
                permission,
                [erc20SpendingLimitConfig],
            ]
        ),
    ]);

    userOp.signature = signature;

    let txData: TxData = {
        to: targetERC20,
        value: 0,
        function: "transfer",
        data: [
            {
                type: "address",
                value: operator.address,
            },
            {
                type: "uint256",
                value: parseUnits("1", 6),
            },
        ],
    };

    let constructData: ConstructData = {
        wallet: walletAddress,
        operator: operator.address,
        permission: permission,
        sessions: [session],
        permitSignature: signature,
        chainId: chainId,
        txData: txData,
    };
    console.log("constructData", constructData);
    fs.writeFileSync("constructData.json", JSON.stringify(constructData, null, 4));

    console.log("============= send userOp =====================");
    let ret = await axios.post(bundlerURL, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [userOp, entryPointAddress],
    });
    if (ret.data.error != undefined) {
        console.log("Send userOp failed: ", ret.data.error);
        return;
    }
    while (true) {
        // get userop receipt
        ret = await axios.post(bundlerURL, {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getUserOperationReceipt",
            params: [userOpHash],
        });
        if (ret.data.result != undefined) {
            console.log("UserOperationReceipt: ", ret.data);
            break;
        }
        await sleep(3000);
    }
}

integration_test()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
