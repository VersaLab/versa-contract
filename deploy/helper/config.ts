import { keccak256 } from "ethers/lib/utils";

export const universalSingletonFactoryAddress = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

export const deployConfig = {
    entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    salt: keccak256("0x" + Buffer.from("Versa-Wallet-v1.0.0-Mainnet").toString("hex")),
    verifyingPaymasterOwner: "0xba4528386736a13b8aC4E9876AC0e220eEd37deb",
    universalPaymasterOwner: "0xba4528386736a13b8aC4E9876AC0e220eEd37deb",
    versaFactoryOwner: "0x147c18AC67F509B031B696878bB18Abc9F417eE3",
};
