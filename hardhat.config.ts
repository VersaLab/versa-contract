import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";
import "dotenv/config";
import "hardhat-contract-sizer";

const POLYGON_MUMBAI_RPC = process.env.POLYGON_MUMBAI_RPC || "https://polygon-testnet.public.blastapi.io";

const SCROLL_SEPOLIA_RPC = process.env.SCROLL_SEPOLIA_RPC || "https://scroll-sepolia.public.blastapi.io";

const DEPLOYER_PRIVATE_KEY_1 =
    process.env.DEPLOYER_PRIVATE_KEY_1 || "0000000000000000000000000000000000000000000000000000000000000001";

const DEPLOYER_PRIVATE_KEY_2 =
    process.env.DEPLOYER_PRIVATE_KEY_2 || "0000000000000000000000000000000000000000000000000000000000000002";

const DEPLOYER_PRIVATE_KEY_3 =
    process.env.DEPLOYER_PRIVATE_KEY_3 || "0000000000000000000000000000000000000000000000000000000000000003";

const DEPLOYER_PRIVATE_KEY_4 =
    process.env.DEPLOYER_PRIVATE_KEY_4 || "0000000000000000000000000000000000000000000000000000000000000004";

const POLYGON_MUMBAI_SCAN_KEY = process.env.POLYGON_MUMBAI_SCAN_KEY;

const SCROLL_SEPOLIA_SCAN_KEY = process.env.SCROLL_SEPOLIA_SCAN_KEY;

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.19",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 20000,
                    },
                },
            },
        ],
    },
    networks: {
        polygonMumbai: {
            url: `${POLYGON_MUMBAI_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
        },
        scrollSepolia: {
            url: `${SCROLL_SEPOLIA_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
        },
    },
    etherscan: {
        apiKey: {
            polygonMumbai: `${POLYGON_MUMBAI_SCAN_KEY}`,
            scrollSepolia: `${SCROLL_SEPOLIA_SCAN_KEY}`,
        },
        customChains: [
            {
                network: "scrollSepolia",
                chainId: 534351,
                urls: {
                    apiURL: "https://api-sepolia.scrollscan.dev/api",
                    browserURL: "https://sepolia.scrollscan.dev",
                },
            },
        ],
    },
};

export default config;
