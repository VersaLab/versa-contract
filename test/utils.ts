import { ethers } from "hardhat";
import { BytesLike, hexConcat, keccak256, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    VersaWallet__factory,
    VersaAccountFactory__factory,
    MockValidator__factory,
    CompatibilityFallbackHandler__factory,
} from "../typechain-types";
import { BigNumber } from "ethers";

export const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

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
        fallbackHandler.address,
        entryPoint,
        signer.address
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

export function getScheduledUserOpHash(op: userOp, entryPoint: string, chainId: number) {
    let hashInitCode = ethers.utils.keccak256(op.initCode);
    let hashCallData = ethers.utils.keccak256(op.callData);
    let hashPaymasterAndData = ethers.utils.keccak256(op.paymasterAndData);

    let abiCoder = new ethers.utils.AbiCoder();

    let pack = abiCoder.encode(
        ["address", "uint256", "bytes32", "bytes32", "uint256", "uint256", "uint256", "bytes32"],
        [
            op.sender,
            op.nonce,
            hashInitCode,
            hashCallData,
            op.callGasLimit,
            op.verificationGasLimit,
            op.preVerificationGas,
            hashPaymasterAndData,
        ]
    );

    let hashPack = ethers.utils.keccak256(pack);
    return ethers.utils.keccak256(abiCoder.encode(["bytes32", "address", "uint256"], [hashPack, entryPoint, chainId]));
}

export async function computeWalletAddress(
    fallbackHandler: string,
    validators: string[],
    validatorInitData: string[],
    validatorType: number[],
    hooks: string[],
    hooksInitData: string[],
    modules: string[],
    moduleInitData: string[],
    creationCode: string,
    singletonAddress: string,
    versaFactory: string,
    salt: BigNumber
) {
    const finalSalt = await getFinalSalt(
        fallbackHandler,
        validators,
        validatorInitData,
        validatorType,
        hooks,
        hooksInitData,
        modules,
        moduleInitData,
        salt
    );
    const initCodeHash = getInitcodeHash(creationCode, singletonAddress);
    const walletAddress =
        "0x" +
        keccak256(
            solidityPack(["bytes1", "address", "bytes32", "bytes32"], ["0xff", versaFactory, finalSalt, initCodeHash])
        ).slice(-40);
    // to ethereum checksum address
    return ethers.utils.getAddress(walletAddress);
}

export function getInitcodeHash(creationCode: string, singletonAddress: string) {
    const initCodeHash = keccak256(ethers.utils.solidityPack(["bytes", "uint256"], [creationCode, singletonAddress]));
    return initCodeHash;
}

export async function getFinalSalt(
    fallbackHandler: string,
    validators: string[],
    validatorInitData: string[],
    validatorType: number[],
    hooks: string[],
    hooksInitData: string[],
    modules: string[],
    moduleInitData: string[],
    salt: BigNumber
) {
    const versaSingleton = await ethers.getContractAt("VersaWallet", ethers.constants.AddressZero);
    const finalSalt = versaSingleton.interface.encodeFunctionData("initialize", [
        fallbackHandler,
        validators,
        validatorInitData,
        validatorType,
        hooks,
        hooksInitData,
        modules,
        moduleInitData,
    ]);
    return keccak256(ethers.utils.solidityPack(["bytes32", "uint256"], [keccak256(finalSalt), salt]));
}

export async function getEncodedMessageHash(payload: string | BytesLike, chainid: number, wallet: string) {
    const abiCoder = new ethers.utils.AbiCoder();

    const DOMAIN_SEPARATOR_TYPEHASH = keccak256(toUtf8Bytes("EIP712Domain(uint256 chainId,address verifyingContract)"));
    const VERSA_MSG_TYPEHASH = keccak256(toUtf8Bytes("VersaWalletMessage(bytes message)"));
    const encodedMessage = keccak256(abiCoder.encode(["bytes32", "bytes32"], [VERSA_MSG_TYPEHASH, payload]));

    const domainSeperator = keccak256(
        abiCoder.encode(["bytes32", "uint256", "address"], [DOMAIN_SEPARATOR_TYPEHASH, chainid, wallet])
    );
    const encodedMessageHash = keccak256(
        solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", domainSeperator, encodedMessage])
    );
    return encodedMessageHash;
}