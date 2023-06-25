import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

  const DEPLOYER_PRIVATE_KEY_2 =
  process.env.DEPLOYER_PRIVATE_KEY_2 ||
  "0000000000000000000000000000000000000000000000000000000000000000";

  const DEPLOYER_PRIVATE_KEY_3 =
  process.env.DEPLOYER_PRIVATE_KEY_3 ||
  "0000000000000000000000000000000000000000000000000000000000000000";


  const DEPLOYER_PRIVATE_KEY_4 =
  process.env.DEPLOYER_PRIVATE_KEY_4 ||
  "0000000000000000000000000000000000000000000000000000000000000000";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: "0.8.18",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        }
      }
    },
    {
      version: "0.5.0"
    }
  ]
  },
  networks: {
    mumbai: {
      url: `https://polygon-testnet.public.blastapi.io`,
      accounts: [`${DEPLOYER_PRIVATE_KEY}`,`${DEPLOYER_PRIVATE_KEY_2}`,`${DEPLOYER_PRIVATE_KEY_3}`,`${DEPLOYER_PRIVATE_KEY_4}`],
      gasPrice: 5000000000 // 2 gwei
    },
    scroll_test: {
      url: `https://scroll-alphanet.public.blastapi.io`,
      accounts: [`${DEPLOYER_PRIVATE_KEY}`,`${DEPLOYER_PRIVATE_KEY_2}`,`${DEPLOYER_PRIVATE_KEY_3}`,`${DEPLOYER_PRIVATE_KEY_4}`],
    }
  },
};

export default config;
