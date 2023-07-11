import { ethers } from "hardhat";
import * as deployer from "./helper/deployer";
import { VersaAccountFactoryData } from "./helper/deployer";
import mumbaiAddresses from "./addresses/polygonMumbai.json";
import scrollTestnetAddresses from "./addresses/scrollTestnet.json";
import fs from "fs";

async function deployWithAddresses(addresses: any) {
    const versaAccountFactoryData: VersaAccountFactoryData = {
        versaSingleton: addresses.versaSingleton,
        defaultFallbackHandler: addresses.compatibilityFallbackHandler,
    };
    const versaAccountFactory = await deployer.deployVersaAccountFactory(versaAccountFactoryData);
    addresses.versaAccountFactory = versaAccountFactory.address;
    return addresses;
}

async function main() {
    const [signer] = await ethers.getSigners();
    const network = await signer.provider?.getNetwork();

    switch (network?.chainId) {
        case 80001: {
            const result = await deployWithAddresses(mumbaiAddresses);
            console.log("writing changed address to output file 'deploy/addresses/polygonMumbai.json'");
            fs.writeFileSync("deploy/addresses/polygonMumbai.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 534353: {
            const result = await deployWithAddresses(scrollTestnetAddresses);
            console.log("writing changed address to output file 'deploy/addresses/scrollTestnet.json'");
            fs.writeFileSync("deploy/addresses/scrollTestnet.json", JSON.stringify(result, null, "\t"), "utf8");
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
