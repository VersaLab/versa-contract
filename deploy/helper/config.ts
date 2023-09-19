import { keccak256 } from "ethers/lib/utils";

export const salt = keccak256("0x" + Buffer.from("versa-wallet-test-0.0.1").toString("hex"));
