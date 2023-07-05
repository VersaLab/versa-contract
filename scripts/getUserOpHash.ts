import { ethers } from "hardhat";
import { getUserOpHash } from "../test/utils";

async function testGetUserOpHash() {
    let entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
    let chainId = 80001;
    let op = {
        sender: ethers.constants.AddressZero,
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        callGasLimit: 2150000,
        verificationGasLimit: 2150000,
        preVerificationGas: 2150000,
        maxFeePerGas: 0,
        maxPriorityFeePerGas: 0,
        paymasterAndData: "0x",
        // 在estimateUserOperationGas时，signature要填，不会真正校验签名，但长度一定要对
        signature:
            "0xb8b6bfb28d8682629e7d09ca53adb91c77b686eb1fb3e6f5b4ec8bed475e1e0e147a59c05acfe20d93ea20ce2f54ebcd8ca9a2d975e11433a639190d61b93de31c",
    };
    let hash = getUserOpHash(op, entryPoint, chainId);
    console.log("hrer");

    let entryPointContract = await ethers.getContractAt("IEntryPoint", entryPoint);
    let actualHash = await entryPointContract.getUserOpHash(op);

    console.log("hash", hash);
    console.log("actual hash", actualHash);
}

testGetUserOpHash();
