import hre, { ethers } from "hardhat";
import mumbaiAddresses from "../addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "../addresses/scrollSepolia.json";
import arbitrumGoerliAddresses from "../addresses/arbitrumGoerli.json";
import arbitrumSepoliaAddresses from "../addresses/arbitrumSepolia.json";
import baseGoerliAddresses from "../addresses/baseGoerli.json";
import baseSepoliaAddresses from "../addresses/baseSepolia.json";
import optimisticGoerliAddresses from "../addresses/optimisticGoerli.json";
import optimisticSepoliaAddresses from "../addresses/optimisticSepolia.json";

import scrollAddresses from "../addresses/scroll.json";
import arbitrumAddresses from "../addresses/arbitrum.json";
import baseAddresses from "../addresses/base.json";
import polygonAddresses from "../addresses/polygon.json";
import optimismAddresses from "../addresses/optimism.json";
import polygonzkevmAddresses from "../addresses/polygonzkevm.json";

import { deployConfig } from "./config";

async function verify(address: string, constructorArguments?: any) {
    await hre.run("verify:verify", {
        address,
        constructorArguments,
    });
}

async function main() {
    const [signer] = await ethers.getSigners();
    const network = await signer.provider?.getNetwork();
    console.log("chainid", network?.chainId);
    let addresses;

    switch (network?.chainId) {
        case 137: {
            addresses = polygonAddresses;
            break;
        }
        case 1101: {
            addresses = polygonzkevmAddresses;
            break;
        }
        case 80001: {
            addresses = mumbaiAddresses;
            break;
        }
        case 534352: {
            addresses = scrollAddresses;
            break;
        }
        case 534351: {
            addresses = scrollSepoliaAddresses;
            break;
        }
        case 42161: {
            addresses = arbitrumAddresses;
            break;
        }
        case 421613: {
            addresses = arbitrumGoerliAddresses;
            break;
        }
        case 421614: {
            addresses = arbitrumSepoliaAddresses;
            break;
        }
        case 10: {
            addresses = optimismAddresses;
            break;
        }
        case 420: {
            addresses = optimisticGoerliAddresses;
            break;
        }
        case 11155420: {
            addresses = optimisticSepoliaAddresses;
            break;
        }
        case 8453: {
            addresses = baseAddresses;
            break;
        }
        case 84531: {
            addresses = baseGoerliAddresses;
            break;
        }
        case 84532: {
            addresses = baseSepoliaAddresses;
            break;
        }
        default: {
            console.log("unsupported network");
        }
    }
    if (addresses) {
        console.log("addresses", addresses);
        await verify(addresses.versaSingleton, [deployConfig.entryPointAddress]);
        await verify(addresses.versaAccountFactory, [
            addresses.versaSingleton,
            addresses.compatibilityFallbackHandler,
            deployConfig.entryPointAddress,
            deployConfig.versaFactoryOwner,
        ]);
        // await verify(addresses.versaVerifyingPaymaster, [
        //     deployConfig.entryPointAddress,
        //     deployConfig.verifyingPaymasterOwner,
        // ]);
        await verify(addresses.versaUniversalPaymaster, [
            deployConfig.entryPointAddress,
            deployConfig.verifyingPaymasterOwner,
        ]);
        await verify(addresses.compatibilityFallbackHandler);
        await verify(addresses.ecdsaValidator);
        await verify(addresses.multisigValidator);
        await verify(addresses.sessionKeyValidator);
        await verify(addresses.spendingLimitHooks);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
