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

export async function deployVersaAccountFactory(data: VersaAccountFactoryData, salt: string) {
    const singletonFactory = await getSingletonFactory();
    const VersaAccountFactory = await ethers.getContractFactory("VersaAccountFactory");
    const initCode = VersaAccountFactory.getDeployTransaction(
        data.versaSingleton,
        data.defaultFallbackHandler,
        data.entryPoint,
        data.owner
    ).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("VersaAccountFactory deployed to:", address);
    }
    return ethers.getContractAt("VersaAccountFactory", address);
}

export async function deployVersaSingleton(entryPoint: string, salt: string) {
    const singletonFactory = await getSingletonFactory();
    const VersaSingleton = await ethers.getContractFactory("VersaWallet");
    const initCode = VersaSingleton.getDeployTransaction(entryPoint).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("VersaSingleton deployed to:", address);
    }
    return await ethers.getContractAt("VersaWallet", address);
}

export async function deployVersaVerifyingPaymaster(entryPoint: string, verifyingPaymasterOwner: string, salt: string) {
    const singletonFactory = await getSingletonFactory();
    const VersaVerifyingPaymaster = await ethers.getContractFactory("VersaVerifyingPaymaster");
    const initCode = VersaVerifyingPaymaster.getDeployTransaction(entryPoint, verifyingPaymasterOwner).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("VersaSingleton deployed to:", address);
    }
    return await ethers.getContractAt("VersaVerifyingPaymaster", address);
}

export async function deployCompatibilityFallbackHandler(salt: string) {
    const singletonFactory = await getSingletonFactory();
    const CompatibilityFallbackHandler = await ethers.getContractFactory("CompatibilityFallbackHandler");
    const initCode = CompatibilityFallbackHandler.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("CompatibilityFallbackHandler deployed to:", address);
    }
    return await ethers.getContractAt("CompatibilityFallbackHandler", address);
}

export async function deploySpendingLimitHooks(salt: string) {
    const singletonFactory = await getSingletonFactory();
    const SpendingLimitHooks = await ethers.getContractFactory("SpendingLimitHooks");
    const initCode = SpendingLimitHooks.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("SpendingLimitHooks deployed to:", address);
    }
    return await ethers.getContractAt("SpendingLimitHooks", address);
}

export async function deployECDSAValidator(salt: string) {
    const singletonFactory = await getSingletonFactory();
    const ECDSAValidator = await ethers.getContractFactory("ECDSAValidator");
    const initCode = ECDSAValidator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();

    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("ECDSAValidator deployed to:", address);
    }
    return await ethers.getContractAt("ECDSAValidator", address);
}

export async function deployMultiSigValidator(salt: string) {
    const singletonFactory = await getSingletonFactory();
    const MultisigValidator = await ethers.getContractFactory("MultiSigValidator");
    const initCode = MultisigValidator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();

    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("MultiSigValidator deployed to:", address);
    }
    return await ethers.getContractAt("MultiSigValidator", address);
}

export async function deploySessionKeyValidator(salt: string) {
    const singletonFactory = await getSingletonFactory();
    const sessionKeyValidator = await ethers.getContractFactory("SessionKeyValidator");
    const initCode = sessionKeyValidator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();

    if (address == ethers.constants.AddressZero) {
        console.log("Deploy failed, this contract with this salt should have been already deployed");
    } else {
        console.log("SessionKeyValidator deployed to:", address);
    }
    return await ethers.getContractAt("SessionKeyValidator", address);
}
