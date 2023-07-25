import hre, { ethers } from "hardhat";

async function verify(address: string, constructorArguments: any) {
    await hre
        .run("verify:verify", {
            // network: `${network?.name}`,
            address,
            constructorArguments,
        })
        .catch(console.log);
}

export interface VersaAccountFactoryData {
    versaSingleton: string;
    defaultFallbackHandler: string;
}

export async function deployVersaAccountFactory(data: VersaAccountFactoryData) {
    const VersaAccountFactory = await ethers.getContractFactory("VersaAccountFactory");
    const versaAccountFactory = await VersaAccountFactory.deploy(data.versaSingleton, data.defaultFallbackHandler);
    await versaAccountFactory.deployed();
    console.log("VersaAccountFactory deployed to:", versaAccountFactory.address);
    return versaAccountFactory;
}

export async function deployVersaSingleton(entryPoint: string) {
    const VersaSingleton = await ethers.getContractFactory("VersaWallet");
    const versaSingleton = await VersaSingleton.deploy(entryPoint);
    await versaSingleton.deployed();
    console.log("VersaSingleton deployed to:", versaSingleton.address);
    return versaSingleton;
}

export async function deployCompatibilityFallbackHandler() {
    const CompatibilityFallbackHandler = await ethers.getContractFactory("CompatibilityFallbackHandler");
    const compatibilityFallbackHandler = await CompatibilityFallbackHandler.deploy();
    console.log("CompatibilityFallbackHandler deployed to: ", compatibilityFallbackHandler.address);
    return compatibilityFallbackHandler;
}

export async function deploySpendingLimitHooks() {
    const SpendingLimitHooks = await ethers.getContractFactory("SpendingLimitHooks");
    const spendingLimitHooks = await SpendingLimitHooks.deploy();
    console.log("Spending limit hooks deployed to: ", spendingLimitHooks.address);
    return spendingLimitHooks;
}

export async function deployECDSAValidator() {
    const ECDSAValidator = await ethers.getContractFactory("ECDSAValidator");
    const ecdsaValidator = await ECDSAValidator.deploy();
    console.log("ECDSA validator deployed to: ", ecdsaValidator.address);
    return ecdsaValidator;
}

export async function deployMultisigValidator() {
    const MultisigValidator = await ethers.getContractFactory("MultiSigValidator");
    const multisigValidator = await MultisigValidator.deploy();
    console.log("MultisigValidator deployed to: ", multisigValidator.address);
    return multisigValidator;
}

export async function deploySessionKeyValidator() {
    const sessionKeyValdiator = await ethers.getContractFactory("SessionKeyValidator");
    const sessionKeyValidator = await sessionKeyValdiator.deploy();
    console.log("SessionKeyValidator deployed to: ", sessionKeyValidator.address);
    return sessionKeyValidator;
}
