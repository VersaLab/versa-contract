import { keccak256 } from "ethers/lib/utils";

export const salt = keccak256("0x" + Buffer.from("versa-wallet-test-1.0.0").toString("hex"));
