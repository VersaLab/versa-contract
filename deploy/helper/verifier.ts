import hre, { ethers } from "hardhat";
import mumbaiAddresses from "../addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "../addresses/scrollSepolia.json";
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

    let addresses;

    switch (network?.chainId) {
        case 80001: {
            addresses = mumbaiAddresses;
            break;
        }
        case 534351: {
            addresses = scrollSepoliaAddresses;
            break;
        }
        default: {
            console.log("unsupported network");
        }
    }
    await verify(addresses!.versaSingleton, [deployConfig.entryPointAddress]);
    await verify(addresses!.versaAccountFactory, [
        addresses!.versaSingleton,
        addresses!.compatibilityFallbackHandler,
        deployConfig.entryPointAddress,
        deployConfig.factoryOwner,
    ]);
    await verify(addresses!.versaVerifyingPaymaster, [
        deployConfig!.entryPointAddress,
        addresses!.versaVerifyingPaymaster,
    ]);
    await verify(addresses!.compatibilityFallbackHandler);
    await verify(addresses!.ecdsaValidator);
    await verify(addresses!.multisigValidator);
    await verify(addresses!.sessionKeyValidator);
    await verify(addresses!.spendingLimitHooks);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
