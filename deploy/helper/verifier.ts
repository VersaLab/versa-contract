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

    switch (network?.chainId) {
        case 80001: {
            await verify(mumbaiAddresses.versaSingleton, [deployConfig.entryPointAddress]);
            await verify(mumbaiAddresses.versaAccountFactory, [
                mumbaiAddresses.versaSingleton,
                mumbaiAddresses.compatibilityFallbackHandler,
                deployConfig.entryPointAddress,
                deployConfig.versaFactoryOwner,
            ]);
            await verify(mumbaiAddresses.versaVerifyingPaymaster, [
                deployConfig.entryPointAddress,
                deployConfig.verifyingPaymasterOwner,
            ]);
            await verify(mumbaiAddresses.compatibilityFallbackHandler);
            await verify(mumbaiAddresses.ecdsaValidator);
            await verify(mumbaiAddresses.multisigValidator);
            await verify(mumbaiAddresses.sessionKeyValidator);
            await verify(mumbaiAddresses.spendingLimitHooks);
            break;
        }
        case 534351: {
            await verify(scrollSepoliaAddresses.versaSingleton, [deployConfig.entryPointAddress]);
            await verify(scrollSepoliaAddresses.versaAccountFactory, [
                scrollSepoliaAddresses.versaSingleton,
                scrollSepoliaAddresses.compatibilityFallbackHandler,
                deployConfig.entryPointAddress,
                deployConfig.versaFactoryOwner,
            ]);
            await verify(scrollSepoliaAddresses.versaVerifyingPaymaster, [
                deployConfig.entryPointAddress,
                deployConfig.verifyingPaymasterOwner,
            ]);
            await verify(scrollSepoliaAddresses.compatibilityFallbackHandler);
            await verify(scrollSepoliaAddresses.ecdsaValidator);
            await verify(scrollSepoliaAddresses.multisigValidator);
            await verify(scrollSepoliaAddresses.sessionKeyValidator);
            await verify(scrollSepoliaAddresses.spendingLimitHooks);
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
