import { ethers } from "hardhat";

export interface VersaAccountFactoryData {
    versaSingleton: string;
    defaultFallbackHandler: string;
}

const singletonFactoryAddress = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const singletonFactoryABI = ["function deploy(bytes _initCode,bytes32 _salt) returns (address createdContract)"];

async function getSingletonFactory() {
    return await ethers.getContractAt(singletonFactoryABI, singletonFactoryAddress);
}

export async function deployVersaAccountFactory(data: VersaAccountFactoryData, salt: string) {
    const singletonFactory = await getSingletonFactory();
    const VersaAccountFactory = await ethers.getContractFactory("VersaAccountFactory");
    const initCode = VersaAccountFactory.getDeployTransaction(data.versaSingleton, data.defaultFallbackHandler).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    console.log("VersaAccountFactory deployed to:", address);
    return await ethers.getContractAt("VersaAccountFactory", address);
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
    console.log("VersaSingleton deployed to:", address);
    return await ethers.getContractAt("VersaWallet", address);
}

export async function deployVersaVerifyingPaymaster(entryPoint: string, verifyingPaymasterOwner: string, salt: string) {
    const singletonFactory = await getSingletonFactory();
    const VersaVerifyingPaymaster = await ethers.getContractFactory("VersaVerifyingPaymaster");
    const initCode = VersaVerifyingPaymaster.getDeployTransaction(entryPoint, verifyingPaymasterOwner).data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    console.log("VersaVerifyingPaymaster deployed to:", address);
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
    console.log("CompatibilityFallbackHandler deployed to: ", address);
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
    console.log("SpendingLimitHooks deployed to: ", address);
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
    console.log("ECDSAValidator deployed to: ", address);
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
    console.log("MultiSigValidator deployed to: ", address);
    return await ethers.getContractAt("MultiSigValidator", address);
}

export async function deploySessionKeyValidator(salt: string) {
    const singletonFactory = await getSingletonFactory();
    const sessionKeyValdiator = await ethers.getContractFactory("SessionKeyValidator");
    const initCode = sessionKeyValdiator.getDeployTransaction().data!;
    const address = await singletonFactory.callStatic.deploy(initCode, salt);

    let tx;
    const [signer] = await ethers.getSigners();
    tx = await singletonFactory.deploy(initCode, salt, { gasLimit: 5000000 });
    await tx.wait();
    console.log("SessionKeyValidator deployed to: ", address);
    return await ethers.getContractAt("SessionKeyValidator", address);
}
