import { ethers } from "hardhat";
import * as deployer from "./helper/deployer";
import { VersaAccountFactoryData } from "./helper/deployer";
import mumbaiAddresses from "./addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "./addresses/scrollSepolia.json";
import fs from "fs";
import { deployConfig } from "./helper/config";
import * as readline from "readline-sync"

async function deployWithAddresses(addresses: any, config: any) {
    const deployCompatibilityFallbackHandler =
        readline.keyInYN("Do you need to deploy compatibilityFallbackHandler?")
    if (deployCompatibilityFallbackHandler) {
        const compatibilityFallbackHandler = await deployer.deployCompatibilityFallbackHandler(config.salt);
        addresses.compatibilityFallbackHandler = compatibilityFallbackHandler.address;
    }

    const deployVersaSingleton =
        readline.keyInYN("Do you need to deploy versa singleton and versa factory?")
    if (deployVersaSingleton) {
        const versaSingleton = await deployer.deployVersaSingleton(config.entryPointAddress, config.salt)
        addresses.versaSingleton = versaSingleton.address

        const versaAccountFactoryData: VersaAccountFactoryData = {
            versaSingleton: addresses.versaSingleton,
            defaultFallbackHandler: addresses.compatibilityFallbackHandler,
        };
        const versaFactory = await deployer.deployVersaAccountFactory(versaAccountFactoryData, config.salt)
        addresses.versaAccountFactory = versaFactory.address
    }

    const deployPaymaster = readline.keyInYN("Do you need to deploy paymaster?")
    if (deployPaymaster) {

    }

    const deloyPlugins =  readline.keyInYN("Do you need to deploy plugins?")
    if (deloyPlugins) {
        const ecdsaValidator = await deployer.deployECDSAValidator(config.salt);
        addresses.ecdsaValidator = ecdsaValidator.address;
        
        const multisigValidator = await deployer.deployMultiSigValidator(config.salt);
        addresses.multisigValidator = multisigValidator.address;

        const sessionKeyValdiator = await deployer.deploySessionKeyValidator(config.salt);
        addresses.sessionKeyValdiator = sessionKeyValdiator.address;

        const spendingLimitHooks = await deployer.deploySpendingLimitHooks(config.salt);
        addresses.spendingLimitHooks = spendingLimitHooks.address;
    }
    return addresses;
}

async function main() {
    const [signer] = await ethers.getSigners();
    const network = await signer.provider?.getNetwork();

    switch (network?.chainId) {
        case 80001: {
            const result = await deployWithAddresses(mumbaiAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/polygonMumbai.json'");
            fs.writeFileSync("deploy/addresses/polygonMumbai.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 534351: {
            const result = await deployWithAddresses(scrollSepoliaAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/scrollSepolia.json'");
            fs.writeFileSync("deploy/addresses/scrollSepolia.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        default: {
            console.log("unsupported network");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });