import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getUserOpHash } from "../../test/utils";
import { arrayify, hexConcat, hexlify } from "@ethersproject/bytes";
import { ethers } from "hardhat";
import { parseEther } from "@ethersproject/units";
import { AbiCoder, keccak256 } from "ethers/lib/utils";
import { numberToFixedHex } from "../../test/base/utils";

const axios = require("axios");
let abiCoder = new AbiCoder();

const fakeSignature =
    "0xb8b6bfb28d8682629e7d09ca53adb91c77b686eb1fb3e6f5b4ec8bed475e1e0e147a59c05acfe20d93ea20ce2f54ebcd8ca9a2d975e11433a639190d61b93de31c";

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateUserOp(options: {
    signer: SignerWithAddress;
    walletAddress: string;
    callData: string;
    initCode?: string;
    payMasterURL?: string;
    gasToken?: string;
}) {
    let { signer, walletAddress, callData, initCode = "0x", payMasterURL = "0x", gasToken = "0x" } = options;

    let code;
    if (signer.provider != undefined) {
        code = await signer.provider.getCode(walletAddress);
    }

    let nonce = 0;

    const wallet = await ethers.getContractAt("VersaWallet", walletAddress);
    console.log("wallet address", wallet.address);

    if (code != undefined && code != "0x") {
        initCode = "0x";
        // get nonce
        nonce = (await wallet.getNonce(0)).toNumber();
    }

    const gasPrice = await ethers.provider.getGasPrice();

    let userOp = {
        sender: walletAddress,
        nonce: hexlify(nonce),
        initCode,
        callData,
        callGasLimit: hexlify(1000000),
        verificationGasLimit: hexlify(1500000),
        preVerificationGas: hexlify(500000),
        maxFeePerGas: gasPrice.toHexString(),
        maxPriorityFeePerGas: hexlify(1000000000),
        paymasterAndData: "0x",
        signature:
            "0x59c044382c5418739ef913865b05f60050f8e587041548215aa595816dfbe77b26408ebd368bc51be61008aaef7b9b87479c91f9c297caf1e33e8c3b2de69a3b1c",
    };

    return userOp;
}

export async function getPaymasterAndData(paymasterURL: string, userOp: any, gasToken: string) {
    let ret = await axios.post(paymasterURL, {
        jsonrpc: "2.0",
        id: 1,
        method: "pm_sponsorUserOperation",
        params: [userOp, gasToken],
    });
    if (ret.data.error != undefined) {
        console.log("Get paymaster data failed: ", ret.data.error);
        // throw new Error("estimate gas failed");
        return [ret.data.result, ret.data.error];
    }
    return [ret.data.result, undefined];
}

export async function estimateGasAndSendUserOpAndGetReceipt(options: {
    bundlerURL: string;
    userOp: any;
    entryPoint: string;
    validator: string;
    signers: SignerWithAddress[];
    scheduled?: Boolean;
    payMasterURL?: string;
    gasToken?: string;
}) {
    let {
        bundlerURL,
        userOp,
        entryPoint,
        validator,
        signers,
        scheduled = false,
        payMasterURL = "",
        gasToken = "0x",
    } = options;

    let [signer] = await ethers.getSigners();

    console.log(userOp);

    if ((await ethers.provider.getBalance(userOp.sender)).lt(parseEther("0.02"))) {
        console.log("insufficient balance, sending gas...");
        let tx = await signer.sendTransaction({
            to: userOp.sender,
            value: parseEther("0.05"),
        });
        await tx.wait();
    }

    userOp.signature = hexConcat([validator, "0x00", fakeSignature]);
    let [gas, error] = await estimateGas(bundlerURL, userOp, entryPoint);
    console.log("gas", gas);
    // if (error != undefined) {
    //     return error;
    // }

    userOp.callGasLimit = hexlify(gas.callGasLimit * 10);
    userOp.verificationGasLimit = hexlify(gas.verificationGas);
    userOp.preVerificationGas = hexlify(gas.preVerificationGas * 2);

    let validAfter;
    let validUntil;
    let maxFeePerGas;
    let maxPriorityFeePerGas;

    console.log("through paymaster?", payMasterURL !== "");
    if (payMasterURL !== "") {
        userOp.signature = fakeSignature;
        let [paymasterAndData] = await getPaymasterAndData(payMasterURL, userOp, gasToken);
        console.log("paymaster data", paymasterAndData);
        userOp.paymasterAndData = paymasterAndData;
    }

    let userOpHash = getUserOpHash(userOp, entryPoint, await signer.getChainId());
    let finalHash = userOpHash;

    if (scheduled == true) {
        let now = Math.floor(new Date().getTime() / 1000);
        validAfter = 0;
        validUntil = 0;
        maxFeePerGas = userOp.maxFeePerGas;
        maxPriorityFeePerGas = userOp.maxPriorityFeePerGas;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );

        finalHash = keccak256(abiCoder.encode(["bytes32", "bytes"], [userOpHash, extraData]));
    }

    let userOpSigs = "0x";

    signers.sort((a, b) => {
        let addressA = a.address.toLocaleLowerCase();
        let addressB = b.address.toLocaleLowerCase();
        if (addressA < addressB) {
            return -1;
        } else if (addressA == addressB) {
            return 0;
        } else {
            return 1;
        }
    });

    const promises = signers.map(async (signer) => {
        const signature = await signer.signMessage(arrayify(finalHash));
        userOpSigs = hexConcat([userOpSigs, signature]);
    });

    await Promise.all(promises);

    userOp.signature = scheduled
        ? hexConcat([
              validator,
              "0x01",
              numberToFixedHex(validUntil!, 6),
              numberToFixedHex(validAfter!, 6),
              numberToFixedHex(Number(maxFeePerGas), 32),
              numberToFixedHex(Number(maxPriorityFeePerGas), 32),
              userOpSigs,
          ])
        : hexConcat([validator, "0x00", userOpSigs]);

    console.log("user op", userOp);

    await sendUserOp(bundlerURL, userOp, entryPoint);

    await getUserOperationReceipt(bundlerURL, userOpHash);
}

export async function estimateGas(bundlerURL: string, userOp: any, entryPoint: string) {
    let ret = await axios.post(bundlerURL, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_estimateUserOperationGas",
        params: [userOp, entryPoint],
    });

    if (ret.data.error != undefined) {
        console.log("Error for estimate gas: ", ret.data.error);
        // throw new Error("estimate gas failed");
        return [ret.data.result, ret.data.error];
    }
    return [ret.data.result, undefined];
}

export async function sendUserOp(bundlerURL: string, userOp: any, entryPoint: string) {
    let ret = await axios.post(bundlerURL, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [userOp, entryPoint],
    });

    if (ret.data.error != undefined) {
        console.log("Error for sending userOp: ", ret.data.error);
        return;
    }
}

export async function getUserOperationReceipt(bundlerURL: string, userOpHash: string) {
    let ret;
    while (true) {
        // get userop receipt
        ret = await axios.post(bundlerURL, {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getUserOperationReceipt",
            params: [userOpHash],
        });

        if (ret.data.result != undefined) {
            console.log("UserOperationReceipt: ", ret.data);
            break;
        }
        await sleep(3000);
    }
    if (!ret.data.result.success) {
        console.log("User op failed");
        process.exit(1);
    }
    return ret.data.result.success;
}
