import hre from "hardhat";
import mumbaiAddresses from "../addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "../addresses/scrollSepolia.json";

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
            await verify(mumbaiAddresses.versaSingleton, [mumbaiAddresses.entryPoint]);
            await verify(mumbaiAddresses.versaAccountFactory, [
                mumbaiAddresses.versaSingleton,
                mumbaiAddresses.compatibilityFallbackHandler,
            ]);
            await verify(mumbaiAddresses.versaVerifyingPaymaster, [
                mumbaiAddresses.entryPoint,
                mumbaiAddresses.verifyingPaymasterOwner,
            ]);
            await verify(mumbaiAddresses.compatibilityFallbackHandler);
            await verify(mumbaiAddresses.ecdsaValidator);
            await verify(mumbaiAddresses.multisigValidator);
            await verify(mumbaiAddresses.sessionKeyValidator);
            await verify(mumbaiAddresses.spendingLimitHooks);
            break;
        }
        case 534351: {
            await verify(scrollSepoliaAddresses.versaSingleton, [scrollSepoliaAddresses.entryPoint]);
            await verify(scrollSepoliaAddresses.versaAccountFactory, [
                scrollSepoliaAddresses.versaSingleton,
                scrollSepoliaAddresses.compatibilityFallbackHandler,
            ]);
            await verify(scrollSepoliaAddresses.versaVerifyingPaymaster, [
                scrollSepoliaAddresses.entryPoint,
                scrollSepoliaAddresses.verifyingPaymasterOwner,
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
