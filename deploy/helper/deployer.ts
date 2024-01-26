import { ethers } from "hardhat";
import { universalSingletonFactoryAddress as singletonFactoryAddress } from "./config";

export interface VersaAccountFactoryData {
    versaSingleton: string;
    defaultFallbackHandler: string;
    entryPoint: string;
    owner: string;
}

const singletonFactoryABI = ["function deploy(bytes _initCode,bytes32 _salt) returns (address createdContract)"];

async function getSingletonFactory() {
    return await ethers.getContractAt(singletonFactoryABI, singletonFactoryAddress);
}

const gaslimit = 5000000;

export async function deployVersaAccountFactory(data: VersaAccountFactoryData, salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const VersaAccountFactory = await ethers.getContractFactory("VersaAccountFactory");
    const initCode = VersaAccountFactory.getDeployTransaction(
        data.versaSingleton,
        data.defaultFallbackHandler,
        data.entryPoint,
        data.owner
    ).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);
    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("VersaAccountFactory deployed to:", address);
    }
    return ethers.getContractAt("VersaAccountFactory", address);
}

export async function deployVersaSingleton(entryPoint: string, salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const VersaSingleton = await ethers.getContractFactory("VersaWallet");
    const initCode = VersaSingleton.getDeployTransaction(entryPoint).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;

        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("VersaWallet deployed to:", address);
    }
    return await ethers.getContractAt("VersaWallet", address);
}

export async function deployVersaVerifyingPaymaster(entryPoint: string, verifyingPaymasterOwner: string, salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const VersaVerifyingPaymaster = await ethers.getContractFactory("VersaVerifyingPaymaster");
    const initCode = VersaVerifyingPaymaster.getDeployTransaction(entryPoint, verifyingPaymasterOwner).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);
    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("VersaVerifyingPaymaster deployed to:", address);
    }
    return await ethers.getContractAt("VersaVerifyingPaymaster", address);
}

export async function deployVersaUniversalPaymaster(entryPoint: string, universalPaymasterOwner: string, salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const VersaVerifyingPaymaster = await ethers.getContractFactory("VersaUniversalPaymaster");
    const initCode = VersaVerifyingPaymaster.getDeployTransaction(entryPoint, universalPaymasterOwner).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("VersaUniversalPaymaster deployed to:", address);
    }
    return await ethers.getContractAt("VersaUniversalPaymaster", address);
}
export async function deployCompatibilityFallbackHandler(salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const CompatibilityFallbackHandler = await ethers.getContractFactory("CompatibilityFallbackHandler");
    const initCode = CompatibilityFallbackHandler.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("CompatibilityFallbackHandler deployed to:", address);
    }
    return await ethers.getContractAt("CompatibilityFallbackHandler", address);
}

export async function deploySpendingLimitHooks(salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const SpendingLimitHooks = await ethers.getContractFactory("SpendingLimitHooks");
    const initCode = SpendingLimitHooks.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("SpendingLimitHooks deployed to:", address);
    }
    return await ethers.getContractAt("SpendingLimitHooks", address);
}

export async function deployECDSAValidator(salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const ECDSAValidator = await ethers.getContractFactory("ECDSAValidator");
    const initCode = ECDSAValidator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("ECDSAValidator deployed to:", address);
    }
    return await ethers.getContractAt("ECDSAValidator", address);
}

export async function deployMultiSigValidator(salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const MultisigValidator = await ethers.getContractFactory("MultiSigValidator");
    const initCode = MultisigValidator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("MultiSigValidator deployed to:", address);
    }
    return await ethers.getContractAt("MultiSigValidator", address);
}

export async function deploySessionKeyValidator(salt: string) {
    const [signer] = await ethers.getSigners();
    const singletonFactory = await getSingletonFactory();
    const sessionKeyValdiator = await ethers.getContractFactory("SessionKeyValidator");
    const initCode = sessionKeyValdiator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    if (address == ethers.constants.AddressZero) {
        console.log("Can't deploy, this contract with this salt should have been already deployed");
    } else {
        let tx;
        tx = await singletonFactory.deploy(initCode, salt, { gasLimit: gaslimit });
        // tx = await singletonFactory.deploy(initCode, salt);
        await tx.wait();
        console.log("SessionKeyValidator deployed to:", address);
    }
    return await ethers.getContractAt("SessionKeyValidator", address);
}
