import { ethers } from "hardhat";
import * as config from "./helper/constants";
import * as deployer from "./helper/deployer";
import mumbaiAddresses from "./addresses/mumbai.json";
import scrollTestnetAddresses from "./addresses/scrollTestnet.json";
import fs from "fs";

async function deployWithAddresses(addresses: any, data: any) {
    const versaSingleton = await deployer.deployVersaSingleton(data.entryPoint);
    addresses.versaSingleton = versaSingleton.address;
    return addresses;
}

async function main() {
    const [signer] = await ethers.getSigners();
    const network = await signer.provider?.getNetwork();

    switch (network?.chainId) {
        case 80001: {
            const result = await deployWithAddresses(mumbaiAddresses, config.mumbaiConfig);
            console.log("writing changed address to output file 'deploy/addresses/mumbai.json'");
            fs.writeFileSync("deploy/addresses/mumbai.json", JSON.stringify(result, null, "\t"), "utf8");
            break;
        }
        case 534353: {
            const result = await deployWithAddresses(scrollTestnetAddresses, config.scrollTestnetConfig);
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
