import { ethers } from "hardhat";
import { AbiCoder, keccak256 } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseEther } from "@ethersproject/units";
import { arrayify, hexConcat, hexlify } from "@ethersproject/bytes";
import { getScheduledUserOpHash, getUserOpHash } from "../../test/utils";
import { numberToFixedHex } from "../../test/base/utils";
import axios from "axios";
import { BigNumber } from "ethers";

const abiCoder = new AbiCoder();
const fakePaymasterAndData =
    "0x41003d1852d67045aacce9e996b1bda482633331f2719572e4e9369cdc061ef602d0f20f8a42234d01000064cb75e60000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006d52e8705345e54062e3f4cf5d6492158d4581237bb7b451d6bc417a1aa5bd6421fb2259258d956aae8161cc19fa2548f10beee3e07af0224196c87bbe9067b316ef56df1b";
const fakeSignature =
    "0x59c044382c5418739ef913865b05f60050f8e587041548215aa595816dfbe77b26408ebd368bc51be61008aaef7b9b87479c91f9c297caf1e33e8c3b2de69a3b1c";

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateUserOp(options: {
    signer: SignerWithAddress;
    walletAddress: string;
    callData: string;
    initCode?: string;
}) {
    const { signer, walletAddress, callData } = options;
    let initCode = options.initCode != undefined ? options.initCode : "0x";
    const wallet = await ethers.getContractAt("VersaWallet", walletAddress);
    console.log("wallet address:", wallet.address);
    let code;
    if (signer.provider != undefined) {
        code = await signer.provider.getCode(walletAddress);
    }
    let nonce = 0;
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
        verificationGasLimit: hexlify(1000000),
        preVerificationGas: hexlify(1000000),
        maxFeePerGas: gasPrice.toHexString(),
        maxPriorityFeePerGas: gasPrice.toHexString(),
        paymasterAndData: "0x",
        signature: fakeSignature,
    };
    return userOp;
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

export async function sendUserOp(bundlerURL: string, userOp: any, entryPoint: string) {
    let ret = await axios.post(bundlerURL, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [userOp, entryPoint],
    });
    if (ret.data.error != undefined) {
        console.log("Send userOp failed: ", ret.data.error);
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
        console.log("Get userOp receipt failed");
        process.exit(1);
    }
    return ret.data.result.success;
}

export async function estimateGasAndSendUserOpAndGetReceipt(options: {
    bundlerURL: string;
    userOp: any;
    entryPoint: string;
    validator: string;
    signers: SignerWithAddress[];
    scheduled?: boolean;
    paymasterURL?: string;
    gasToken?: string;
}) {
    let {
        bundlerURL,
        userOp,
        entryPoint,
        validator,
        signers,
        scheduled = false,
        paymasterURL = "",
        gasToken = "0x",
    } = options;
    let [signer] = await ethers.getSigners();
    console.log("userOp: ", userOp);
    const chainId = await signer.getChainId();
    if ((await ethers.provider.getBalance(userOp.sender)).lt(parseEther("0.001"))) {
        console.log("insufficient balance, sending gas...");
        let tx;
        switch (chainId) {
            case 80001: {
                tx = await signer.sendTransaction({
                    to: userOp.sender,
                    value: parseEther("0.02"),
                });
                break;
            }
            case 534351: {
                tx = await signer.sendTransaction({
                    to: userOp.sender,
                    value: parseEther("0.002"),
                });
                break;
            }
            default: {
                console.log("unsupported network");
            }
        }
        await tx!.wait();
    }
    userOp.signature = hexConcat([validator, "0x00", fakeSignature]);
    let [gas, error] = await estimateGas(bundlerURL, userOp, entryPoint);
    console.log("estimate gas:", gas);
    // if (error != undefined) {
    //     return error;
    // }
    userOp.callGasLimit = hexlify(gas.callGasLimit);
    userOp.verificationGasLimit = hexlify(gas.verificationGas);
    userOp.preVerificationGas = hexlify(gas.preVerificationGas);
    console.log("through paymaster?", paymasterURL !== "");
    if (paymasterURL !== "") {
        let [paymasterAndData] = await getPaymasterAndData(paymasterURL, userOp, gasToken);
        console.log("paymaster data", paymasterAndData);
        userOp.paymasterAndData = paymasterAndData;
    }
    let validAfter;
    let validUntil;
    let maxFeePerGas;
    let maxPriorityFeePerGas;
    let userOpHash = getUserOpHash(userOp, entryPoint, chainId);
    let finalHash = userOpHash;
    if (scheduled == true) {
        let now = Math.floor(new Date().getTime() / 1000);
        validUntil = 0;
        validAfter = 0;
        maxFeePerGas = userOp.maxFeePerGas * 5;
        maxPriorityFeePerGas = userOp.maxFeePerGas * 5;
        let extraData = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256"],
            [validUntil, validAfter, maxFeePerGas, maxPriorityFeePerGas]
        );
        userOpHash = getScheduledUserOpHash(userOp, entryPoint, chainId);
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
    console.log("userOp: ", userOp);
    await sendUserOp(bundlerURL, userOp, entryPoint);
    await getUserOperationReceipt(bundlerURL, userOpHash);
}
