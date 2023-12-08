import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";
import "dotenv/config";
import "hardhat-contract-sizer";

const POLYGON_MUMBAI_RPC = process.env.POLYGON_MUMBAI_RPC || "https://polygon-testnet.public.blastapi.io";

const SCROLL_SEPOLIA_RPC = process.env.SCROLL_SEPOLIA_RPC || "https://scroll-sepolia.public.blastapi.io";

const ARBITRUM_SEPOLIA_RPC =
    process.env.ARBITRUM_SEPOLIA_RPC || "https://arbitrum-sepolia.blockpi.network/v1/rpc/public";

const OPTIMISM_SEPOLIA_RPC =
    process.env.OPTIMISM_SEPOLIA_RPC ||
    "https://optimism-sepolia.blockpi.network/v1/rpc/76f6a1c5f8f95487af484be096ef3572cd7e14c7";

const BASE_SEPOLIA_RPC =
    process.env.BASE_SEPOLIA_RPC ||
    "https://base-sepolia.blockpi.network/v1/rpc/377093fd4b4105db6441f07cf0f746991d5aeda3";

const ARBITRUM_GOERLI_RPC = process.env.ARBITRUM_GOERLI_RPC;

const BASE_GOERLI_RPC = process.env.BASE_GOERLI_RPC;

const OPTIMISM_GOERLI_RPC = process.env.OPTIMISM_GOERLI_RPC;

const DEPLOYER_PRIVATE_KEY_1 =
    process.env.DEPLOYER_PRIVATE_KEY_1 || "0000000000000000000000000000000000000000000000000000000000000001";

const DEPLOYER_PRIVATE_KEY_2 =
    process.env.DEPLOYER_PRIVATE_KEY_2 || "0000000000000000000000000000000000000000000000000000000000000002";

const DEPLOYER_PRIVATE_KEY_3 =
    process.env.DEPLOYER_PRIVATE_KEY_3 || "0000000000000000000000000000000000000000000000000000000000000003";

const DEPLOYER_PRIVATE_KEY_4 =
    process.env.DEPLOYER_PRIVATE_KEY_4 || "0000000000000000000000000000000000000000000000000000000000000004";

const POLYGON_SCAN_KEY = process.env.POLYGON_SCAN_KEY;

const SCROLL_SEPOLIA_SCAN_KEY = process.env.SCROLL_SEPOLIA_SCAN_KEY;

const ARBITRUM_SCAN_KEY = process.env.ARBITRUM_SCAN_API_KEY;

const OPTIMISM_SCAN_KEY = process.env.OPTIMISM_SCAN_API_KEY;

const BASR_SCAN_KEY = process.env.BASE_SCAN_API_KEY;

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
                    evmVersion: "london",
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
        optimismSepolia: {
            url: `${OPTIMISM_SEPOLIA_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
        },
        baseSepolia: {
            url: `${BASE_SEPOLIA_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
        },
        arbitrumSepolia: {
            url: `${ARBITRUM_SEPOLIA_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
        },
        arbitrumGoerli: {
            url: `${ARBITRUM_GOERLI_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
        },
        baseGoerli: {
            url: `${BASE_GOERLI_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
            gasPrice: 1500000000,
        },
        optimismGoerli: {
            url: `${OPTIMISM_GOERLI_RPC}`,
            accounts: [
                `${DEPLOYER_PRIVATE_KEY_1}`,
                `${DEPLOYER_PRIVATE_KEY_2}`,
                `${DEPLOYER_PRIVATE_KEY_3}`,
                `${DEPLOYER_PRIVATE_KEY_4}`,
            ],
            gasPrice: 1500000000,
        },
    },
    etherscan: {
        apiKey: {
            polygonMumbai: `${POLYGON_SCAN_KEY}`,
            scrollSepolia: `${SCROLL_SEPOLIA_SCAN_KEY}`,
            arbitrumSepolia: `${ARBITRUM_SCAN_KEY}`,
            optimismSepolia: `${OPTIMISM_SCAN_KEY}`,
            baseSepolia: `${BASR_SCAN_KEY}`,
            arbitrumGoerli: `${ARBITRUM_SCAN_KEY}`,
            optimisticGoerli: `${OPTIMISM_SCAN_KEY}`,
            baseGoerli: `${BASR_SCAN_KEY}`,
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
            {
                network: "arbitrumSepolia",
                chainId: 421614,
                urls: {
                    apiURL: "https://api-sepolia.arbiscan.io/api",
                    browserURL: "https://sepolia.arbiscan.io",
                },
            },
            {
                network: "optimismSepolia",
                chainId: 11155420,
                urls: {
                    apiURL: "https://api-sepolia.optimistic.etherscan.io",
                    browserURL: "https://sepolia-optimism.etherscan.io/",
                },
            },
            {
                network: "baseSepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://base-sepolia.blockscout.com/api",
                    browserURL: "https://base-sepolia.blockscout.com/",
                },
            },
            {
                network: "baseGoerli",
                chainId: 84531,
                urls: {
                    apiURL: "https://api-goerli.basescan.org/api",
                    browserURL: "https://goerli.basescan.org/",
                },
            },
        ],
    },
};

export default config;
