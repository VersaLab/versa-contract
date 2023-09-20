import { keccak256 } from "ethers/lib/utils";

export const universalSingletonFactoryAddress = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

export const deployConfig = {
    entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    salt: keccak256("0x" + Buffer.from("versa-wallet-v1.0.0-test").toString("hex")),
    verifyingPaymasterOwner: "0x43370254AAAce51006cf368eb7734DB43Ddf9880"
}
