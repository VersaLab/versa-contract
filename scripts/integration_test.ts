
import { hexConcat, arrayify, hexZeroPad, parseEther } from "ethers/lib/utils"
import mumbaiAddresses from "../deploy/addresses/mumbai.json";
import * as config from "../deploy/helper/constants";
import { generateWalletInitCode } from "../test/utils";
import { ethers } from "ethers";
const axios = require('axios');
const hre = require("hardhat")
import { hexlify } from "ethers/lib/utils";

// const bundlerURL = "https://api.stackup.sh/v1/node/337595857e17a3af5187c753cb06373bf62025bd97682cb1fecd2788b0066e31"
const bundlerURL = "https://api.pimlico.io/v1/mumbai/rpc?apikey=0496d685-7894-41eb-aff2-3d13ccfaf302"

const salt = 0

const fakeSignature = "0xb8b6bfb28d8682629e7d09ca53adb91c77b686eb1fb3e6f5b4ec8bed475e1e0e147a59c05acfe20d93ea20ce2f54ebcd8ca9a2d975e11433a639190d61b93de31c"

test_userOp()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function test_userOp() {
    const signer = (await hre.ethers.getSigners())[0];
    let abiCoder = new hre.ethers.utils.AbiCoder
    const addr = await signer.getAddress();
    console.log("signer address: ", addr);

    const entrypoint = await hre.ethers.getContractAt("IEntryPoint", config.mumbaiConfig.entryPoint);
    const versaAccountFactory = await hre.ethers.getContractAt("VersaAccountFactory", mumbaiAddresses.versaAccountFactory);
    const validatorInitdata = abiCoder.encode(["address"],[addr])
    let { initCode, walletAddress } = await generateWalletInitCode({
        versaFacotryAddr: versaAccountFactory.address,
        salt,
        sudoValidator: mumbaiAddresses.ecdsaValidator,
        sudoValidatorInitData: validatorInitdata
    })

    // Paymaster data
    let paymasterAddr = "0x40165094452F2DBA8B602D023CA30DB931Ba9A80"
    let token = "0x8478643D27DbE81d199f74f654E4b0e41d867de3"
    // let paymasterAndData = hexConcat([paymasterAddr, token])
    let paymasterAndData = '0x'

    const wallet = await hre.ethers.getContractAt("VersaWallet", walletAddress);
    console.log("wallet address", wallet.address);

    let code = await signer.provider.getCode(walletAddress)

    let nonce = 0;
    if (code != undefined && code != '0x') {
      initCode = '0x'
      // get nonce
      nonce = await wallet.getNonce(0)
      console.log("nonce", nonce)
    }

    const gasPrice = await hre.ethers.provider.getGasPrice()
    console.log("maxFeePerGas : ", gasPrice);
    const userOp = {
        sender : walletAddress,
        nonce: hexlify(nonce),
        initCode,
        callData : wallet.interface.encodeFunctionData("sudoExecute", [addr,parseEther("1"),"0x",0]),
        callGasLimit : 2150000,
        verificationGasLimit : 1500000,
        preVerificationGas : 1500000,
        maxFeePerGas: gasPrice.toHexString(),
        maxPriorityFeePerGas: 1000000000,
        paymasterAndData,
        signature: "0x"
    }
    if((await hre.ethers.provider.getBalance(walletAddress)).lt(parseEther("0.02"))) {
    console.log("insufficient balance, sending gas...");
    let tx = await signer.sendTransaction({
        to: walletAddress,
        value: parseEther("0.02")
    })
    await tx.wait()
    }

    const bundler = new hre.ethers.providers.JsonRpcProvider(bundlerURL);
    userOp.signature = hexConcat([mumbaiAddresses.ecdsaValidator, "0x00", fakeSignature])
    const gas = await bundler.send("eth_estimateUserOperationGas", [userOp, entrypoint.address]);
    console.log("gas: ", gas);
    userOp.callGasLimit = gas.callGasLimit;
    userOp.verificationGasLimit = gas.verificationGas;
    userOp.preVerificationGas = gas.preVerificationGas;

    const userOpHash = await entrypoint.getUserOpHash(userOp);
    const userOpHashHex = arrayify(userOpHash);
    const userOpSig = await signer.signMessage(userOpHashHex);

    console.log("userOpSig: ", userOpSig);
    userOp.signature = hexConcat([mumbaiAddresses.ecdsaValidator, "0x00", userOpSig])

    let ret = await axios.post(
        bundlerURL,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_sendUserOperation",
          params: [
            userOp,
            entrypoint.address
          ]
        }
      )

    console.log(ret.data)
    if (ret.data.error != undefined) {
        console.log("Error for sending userOp: ", ret.data.error)
        return
    }

    while(true) {
    // get userop receipt
    ret = await axios.post(
        bundlerURL,
        {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getUserOperationReceipt",
        params: [
            userOpHash
        ]
        }
    )

    if (ret.data.result != undefined) {
        console.log("UserOperationReceipt: ", ret.data)
        break;
    }
    await sleep(3000)
    }
    if (!ret.data.result.success) {
        throw new Error('User op failed');
    }
}

function sleep(ms:number) {
    return new Promise(resolve=>setTimeout(resolve, ms))
}

