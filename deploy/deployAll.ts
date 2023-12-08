import { ethers } from "hardhat";
import * as deployer from "./helper/deployer";
import { VersaAccountFactoryData } from "./helper/deployer";
import mumbaiAddresses from "./addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "./addresses/scrollSepolia.json";
import arbitrumSepoliaAddresses from "./addresses/arbitrumSepolia.json";
import arbitrumGoerliAddresses from "./addresses/arbitrumGoerli.json";
import baseSepoliaAddresses from "./addresses/baseSepolia.json";
import baseGoerliAddresses from "./addresses/baseGoerli.json";
import optimisticSepoliaAddresses from "./addresses/optimisticSepolia.json";
import optimisticGoerliAddresses from "./addresses/optimisticGoerli.json";

import fs from "fs";
import { deployConfig } from "./helper/config";
import * as readline from "readline-sync";
import { parseEther } from "ethers/lib/utils";
import { salt } from "../scripts/utils/config";

async function deployWithAddresses(addresses: any, config: any) {
    const deployCompatibilityFallbackHandler = readline.keyInYN("Do you need to deploy compatibilityFallbackHandler?");
    if (deployCompatibilityFallbackHandler) {
        const compatibilityFallbackHandler = await deployer.deployCompatibilityFallbackHandler(config.salt);
        if (compatibilityFallbackHandler.address != ethers.constants.AddressZero) {
            addresses.compatibilityFallbackHandler = compatibilityFallbackHandler.address;
        }
    }

    const deployVersaSingleton = readline.keyInYN("Do you need to deploy versa singleton and versa factory?");
    if (deployVersaSingleton) {
        const versaSingleton = await deployer.deployVersaSingleton(config.entryPointAddress, config.salt);
        if (versaSingleton.address != ethers.constants.AddressZero) {
            addresses.versaSingleton = versaSingleton.address;
        }

        const versaAccountFactoryData: VersaAccountFactoryData = {
            versaSingleton: addresses.versaSingleton,
            defaultFallbackHandler: addresses.compatibilityFallbackHandler,
            entryPoint: deployConfig.entryPointAddress,
            owner: deployConfig.versaFactoryOwner,
        };
        const versaFactory = await deployer.deployVersaAccountFactory(versaAccountFactoryData, config.salt);
        if (versaFactory.address != ethers.constants.AddressZero) {
            addresses.versaAccountFactory = versaFactory.address;
        }
    }
    const needStake = readline.keyInYN("Do you need to stake for factory?");
    if (needStake) {
        const stakeAmount = readline.question("Please enter stake amount(in 1e18): ");
        const unstakeDelaySec = readline.question("Please enter the unstake delay(in seconds): ");
        if (parseEther(stakeAmount.toString()).gt(0)) {
            const versaFactory = await ethers.getContractAt("VersaAccountFactory", addresses.versaAccountFactory);
            let tx = await versaFactory.addStake(unstakeDelaySec, { value: parseEther(stakeAmount.toString()) });
            await tx.wait();
            console.log("Staked success!");
        }
    }

    const deployPaymaster = readline.keyInYN("Do you need to deploy paymaster?");
    if (deployPaymaster) {
        const versaVerifyingPaymaster = await deployer.deployVersaVerifyingPaymaster(
            config.entryPointAddress,
            config.verifyingPaymasterOwner,
            config.salt
        );
        if (versaVerifyingPaymaster.address != ethers.constants.AddressZero) {
            addresses.versaVerifyingPaymaster = versaVerifyingPaymaster.address;
        }
    }

    const deloyPlugins = readline.keyInYN("Do you need to deploy plugins?");
    if (deloyPlugins) {
        const ecdsaValidator = await deployer.deployECDSAValidator(config.salt);
        if (ecdsaValidator.address != ethers.constants.AddressZero) {
            addresses.ecdsaValidator = ecdsaValidator.address;
        }

        const multisigValidator = await deployer.deployMultiSigValidator(config.salt);
        if (multisigValidator.address != ethers.constants.AddressZero) {
            addresses.multisigValidator = multisigValidator.address;
        }

        const sessionKeyValidator = await deployer.deploySessionKeyValidator(config.salt);
        if (sessionKeyValidator.address != ethers.constants.AddressZero) {
            addresses.sessionKeyValidator = sessionKeyValidator.address;
        }
        const spendingLimitHooks = await deployer.deploySpendingLimitHooks(config.salt);
        if (spendingLimitHooks.address != ethers.constants.AddressZero) {
            addresses.spendingLimitHooks = spendingLimitHooks.address;
        }
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
        case 84532: {
            const result = await deployWithAddresses(baseSepoliaAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/baseSepolia.json'");
            fs.writeFileSync("deploy/addresses/baseSepolia.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 84531: {
            const result = await deployWithAddresses(baseGoerliAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/baseGoerli.json'");
            fs.writeFileSync("deploy/addresses/baseGoerli.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 421614: {
            const result = await deployWithAddresses(arbitrumSepoliaAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/arbitrumSepolia.json'");
            fs.writeFileSync("deploy/addresses/arbitrumSepolia.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 421613: {
            const result = await deployWithAddresses(arbitrumGoerliAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/arbitrumGoerli.json'");
            fs.writeFileSync("deploy/addresses/arbitrumGoerli.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 11155420: {
            const result = await deployWithAddresses(optimisticSepoliaAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/optimisticSepolia.json'");
            fs.writeFileSync("deploy/addresses/optimisticSepolia.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 420: {
            const result = await deployWithAddresses(optimisticGoerliAddresses, deployConfig);
            console.log("writing changed address to output file 'deploy/addresses/optimisticGoerli.json'");
            fs.writeFileSync("deploy/addresses/optimisticGoerli.json", JSON.stringify(result, null, "\t"), "utf8");
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
