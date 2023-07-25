import { ethers } from "hardhat";
import { hexConcat } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    VersaWallet__factory,
    VersaAccountFactory__factory,
    MockValidator__factory,
    CompatibilityFallbackHandler__factory,
} from "../typechain-types";

export async function deployVersaWallet(options: {
    signer: SignerWithAddress;
    entryPoint: string;
    sudoValidatorAddr?: string;
}) {
    let {
        signer,
        entryPoint,
        sudoValidatorAddr = ethers.constants.AddressZero,
        // sudoValidatorInitData,
        // hooks = [],
        // hooksInitData = [],
        // module = [],
        // moduleInitData = []
    } = options;

    let fallbackHandler = await new CompatibilityFallbackHandler__factory(signer).deploy();
    // Deploy versa singleton
    let versaWalletSingleton = await new VersaWallet__factory(signer).deploy(entryPoint);
    // Deploy VersaAccountFactory
    let versaFactory = await new VersaAccountFactory__factory(signer).deploy(
        versaWalletSingleton.address,
        fallbackHandler.address
    );

    sudoValidatorAddr =
        sudoValidatorAddr == ethers.constants.AddressZero
            ? (await new MockValidator__factory(signer).deploy()).address
            : sudoValidatorAddr;

    let tx = await versaFactory.createAccount([sudoValidatorAddr], ["0x"], [1], [], [], [], [], 0);
    await tx.wait();

    let walletAddress = await versaFactory.getAddress([sudoValidatorAddr], ["0x"], [1], [], [], [], [], 0);
    return VersaWallet__factory.connect(walletAddress, signer);
}

export async function generateWalletInitCode(options: {
    versaFacotryAddr: string;
    salt: number;
    sudoValidator: string;
    sudoValidatorInitData: string;
    hooks?: string[];
    hooksInitData?: string[];
    modules?: string[];
    moduleInitData?: string[];
}) {
    const {
        versaFacotryAddr,
        salt,
        sudoValidator,
        sudoValidatorInitData,
        hooks = [],
        hooksInitData = [],
        modules = [],
        moduleInitData = [],
    } = options;
    const versaFactory = await ethers.getContractAt("VersaAccountFactory", versaFacotryAddr);

    let tx = await versaFactory.populateTransaction.createAccount(
        [sudoValidator],
        [sudoValidatorInitData],
        [1],
        hooks,
        hooksInitData,
        modules,
        moduleInitData,
        salt
    );

    let initCode = hexConcat([versaFacotryAddr, tx.data!]);
    let walletAddress = await versaFactory.getAddress(
        [sudoValidator],
        [sudoValidatorInitData],
        [1],
        hooks,
        hooksInitData,
        modules,
        moduleInitData,
        salt
    );

    return { initCode, walletAddress };
}

export interface userOp {
    sender: string;
    nonce: number;
    initCode: string;
    callData: string;
    callGasLimit: number;
    verificationGasLimit: number;
    preVerificationGas: number;
    maxFeePerGas: number;
    maxPriorityFeePerGas: number;
    paymasterAndData: string;
}

export function getUserOpHash(op: userOp, entryPoint: string, chainId: number) {
    let hashInitCode = ethers.utils.keccak256(op.initCode);
    let hashCallData = ethers.utils.keccak256(op.callData);
    let hashPaymasterAndData = ethers.utils.keccak256(op.paymasterAndData);

    let abiCoder = new ethers.utils.AbiCoder();

    let pack = abiCoder.encode(
        ["address", "uint256", "bytes32", "bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
        [
            op.sender,
            op.nonce,
            hashInitCode,
            hashCallData,
            op.callGasLimit,
            op.verificationGasLimit,
            op.preVerificationGas,
            op.maxFeePerGas,
            op.maxPriorityFeePerGas,
            hashPaymasterAndData,
        ]
    );

    let hashPack = ethers.utils.keccak256(pack);
    return ethers.utils.keccak256(abiCoder.encode(["bytes32", "address", "uint256"], [hashPack, entryPoint, chainId]));
}
