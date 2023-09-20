import { ethers } from "hardhat";
import * as deployer from "./helper/deployer";
import mumbaiAddresses from "./addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "./addresses/scrollSepolia.json";
import fs from "fs";
import { deployConfig } from "./helper/config";

async function deployWithAddresses(addresses: any, config: any) {
    const versaSingleton = await deployer.deployVersaSingleton(config.entryPoint, config.salt);
    addresses.versaSingleton = versaSingleton.address;
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
