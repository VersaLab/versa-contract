import hre from "hardhat";
import { ethers } from "hardhat";

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
    const versaSingleton = await VersaSingleton.deploy(entryPoint, { gasLimit: 5000000 });
    await versaSingleton.deployed();
    console.log("VersaSingleton deployed to:", versaSingleton.address);
    return versaSingleton;
}

export async function deployECDSAValidator() {
    const ECDSAValidator = await ethers.getContractFactory("ECDSAValidator");
    const ecdsaValidator = await ECDSAValidator.deploy();
    console.log("ECDSA validator deployed to: ", ecdsaValidator.address);
    return ecdsaValidator;
}

export async function deployCompatibilityFallbackHandler() {
    const CompatibilityFallbackHandler = await ethers.getContractFactory("CompatibilityFallbackHandler");
    const compatibilityFallbackHandler = await CompatibilityFallbackHandler.deploy();
    console.log("CompatibilityFallbackHandler deployed to: ", compatibilityFallbackHandler.address);
    return compatibilityFallbackHandler;
}

// export async function deployEllipticCurve() {
//   const EllipticCurve = await ethers.getContractFactory("EllipticCurve");
//   const ellipticCurve = await EllipticCurve.deploy();
//   await ellipticCurve.deployed();
//   console.log("EllipticCurve deployed to:", ellipticCurve.address);
//   return ellipticCurve;
// }

// export interface SpendingLimitData {
//   SocialRecovery: string;
//   MultiSendOnly: string;
// }

// export async function deploySpendingLimit(
//   spendingLimitData: SpendingLimitData
// ) {
//   const SpendingLimitModule = await ethers.getContractFactory(
//     "SpendingLimitModule"
//   );
//   const spendingLimitModule = await SpendingLimitModule.deploy(
//     spendingLimitData.SocialRecovery,
//     spendingLimitData.MultiSendOnly
//   );
//   await spendingLimitModule.deployed();
//   console.log("SpendingLimitModule deployed to:", spendingLimitModule.address);
//   return spendingLimitModule;
// }

// export async function deploySocialRecovery(gasReceiver: string) {
//   const SocialRecoveryModule = await ethers.getContractFactory(
//     "SocialRecoveryModule"
//   );
//   const socialRecoveryModule = await SocialRecoveryModule.deploy(gasReceiver);
//   await socialRecoveryModule.deployed();
//   console.log(
//     "SocialRecoveryModule deployed to:",
//     socialRecoveryModule.address
//   );
//   return socialRecoveryModule;
// }
