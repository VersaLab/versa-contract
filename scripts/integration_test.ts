import { hexConcat, arrayify, parseEther, parseUnits } from "ethers/lib/utils";
import mumbaiAddresses from "../deploy/addresses/mumbai.json";
import * as config from "../deploy/helper/constants";
import { generateWalletInitCode } from "../test/utils";

import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { estimateGasAndSendUserOpAndGetReceipt, generateUserOp, sleep } from "./utils/bundler";
import { salt, bundlerURL, mumbaiUSDT, mumbaiPaymasterAddress, paymasterURL } from "./utils/config";
import { AddressOne } from "../@safe-contracts/src";
import { BigNumber } from "ethers";

const ecdsaValidator = mumbaiAddresses.ecdsaValidator;
const multisigValidator = mumbaiAddresses.multisigValidator;
const entryPointAddress = config.mumbaiConfig.entryPoint;
const spendingLimitAddress = mumbaiAddresses.spendingLimitHooks;

const targetERC20 = mumbaiUSDT;
const paymasterAddress = mumbaiPaymasterAddress;

/** This test covers:
 * 1. Base functions:
 *      - create a new wallet
 *      - test native tokens sending
 *      - test native token and ERC721 receiving(CompabilityFallbackHandler)
 *      - normal/sudo execute, signle/batch execute
 *      - scheduled transaction
 *      - Transaction using paymaster
 *
 * 2. Validator related:
 *      - change ecdsa signer
 *      - change validator type
 *      - enable a new validator
 *      - add Guardians for multisig validator
 *      - disable a validator
 *
 * 3. hooks/module related:
 *      - enable hooks/module
 *      - set spending limit
 *      - test execute transaction from module
 *      - disable hooks/module
 */

integration_test()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

async function integration_test() {
    let [signer1, signer2, signer3, signer4] = await ethers.getSigners();
    let abiCoder = new ethers.utils.AbiCoder();
    const addr = await signer1.getAddress();

    const versaAccountFactory = await ethers.getContractAt("VersaAccountFactory", mumbaiAddresses.versaAccountFactory);
    const validatorInitdata = abiCoder.encode(["address"], [addr]);
    let { initCode, walletAddress } = await generateWalletInitCode({
        versaFacotryAddr: versaAccountFactory.address,
        salt,
        sudoValidator: ecdsaValidator,
        sudoValidatorInitData: validatorInitdata,
    });
    const wallet = await ethers.getContractAt("VersaWallet", walletAddress);

    // console.log("============deploy new wallet=================")
    let calldata = wallet.interface.encodeFunctionData("normalExecute", [
        signer1.address,
        parseEther("0.00001"),
        "0x",
        0,
    ]);

    let userOp = await generateUserOp({ signer: signer1, walletAddress: walletAddress, callData: calldata, initCode });

    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: ecdsaValidator,
        signers: [signer1],
    });

    console.log("============fallback functions and enable validator=============");
    const testNFTAbi = [
        // Some details about the token
        "function mint()",
    ];

    const testNFTAddress = "0xFacdAD1360842a671f8d108FfBf3333eb151a65B";
    let batchData = [];

    let testNFT = await ethers.getContractAt(testNFTAbi, testNFTAddress);
    let mintData = testNFT.interface.encodeFunctionData("mint");

    // test NativeTokenSending
    batchData.push([signer1.address, parseEther("0.0001"), "0x", 0]);

    // test NativeTokenReceive
    batchData.push([walletAddress, parseEther("0.0001"), "0x", 0]);

    // test ERC721 Receiving
    batchData.push([testNFTAddress, 0, mintData, 0]);

    // set new ecdsa signer
    let ECDSA = await ethers.getContractAt("ECDSAValidator", ecdsaValidator);
    let setSignerData = ECDSA.interface.encodeFunctionData("setSigner", [signer2.address]);
    batchData.push([ecdsaValidator, 0, setSignerData, 0]);

    // add multi-sig validator
    let enableMultisigInitData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 2]);
    let enableMultisigValidator = wallet.interface.encodeFunctionData("enableValidator", [
        multisigValidator,
        1,
        enableMultisigInitData,
    ]);
    batchData.push([walletAddress, 0, enableMultisigValidator, 0]);

    // toggle ecdsa validator to normal
    let toggleEcdsa = wallet.interface.encodeFunctionData("toggleValidatorType", [multisigValidator, ecdsaValidator]);
    batchData.push([walletAddress, 0, toggleEcdsa, 0]);

    let to = [];
    let value = [];
    let data = [];
    let operation = [];
    for (let i = 0; i < batchData.length; i++) {
        to.push(batchData[i][0]);
        value.push(batchData[i][1]);
        data.push(batchData[i][2]);
        operation.push(batchData[i][3]);
    }
    calldata = wallet.interface.encodeFunctionData("batchSudoExecute", [to, value, data, operation]);

    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: ecdsaValidator,
        signers: [signer1],
    });

    // Status checks
    let newSigner = await ECDSA.getSigner(walletAddress);
    if (newSigner !== signer2.address) {
        throw new Error("Set ecdsa validator signer failed");
    }

    let validatorType = await wallet.getValidatorType(ecdsaValidator);
    let validatorType2 = await wallet.getValidatorType(multisigValidator);

    if (validatorType !== 2 || validatorType2 !== 1) {
        throw new Error("Set validator type failed");
    }

    console.log("===============disable validator=============");
    // Validate through multisig validator and disable ecdsa validator
    let disableData = wallet.interface.encodeFunctionData("disableValidator", [AddressOne, ecdsaValidator]);
    calldata = wallet.interface.encodeFunctionData("sudoExecute", [walletAddress, 0, disableData, 0]);

    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    // test scheduled transaction here
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: multisigValidator,
        signers: [signer1, signer2],
    });

    validatorType = await wallet.getValidatorType(ecdsaValidator);
    validatorType2 = await wallet.getValidatorType(multisigValidator);

    if (validatorType !== 0) {
        throw new Error("Disable validator failed");
    }

    console.log("===============scheduled transaction=============");
    calldata = wallet.interface.encodeFunctionData("normalExecute", [signer1.address, parseEther("0.00001"), "0x", 0]);
    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: multisigValidator,
        signers: [signer1, signer2],
        scheduled: true,
    });

    console.log("=============== paymaster transaction =============");
    const ERC20 = await ethers.getContractAt("IERC20", targetERC20);
    if ((await ERC20.balanceOf(walletAddress)).lt(parseUnits("1", 6))) {
        console.log("insufficient erc20 token balance, transferring...");
        let tx = await ERC20.connect(signer1).transfer(walletAddress, parseUnits("2", 6));
        await tx.wait();
    }

    let erc20ApproveData = ERC20.interface.encodeFunctionData("approve", [paymasterAddress, parseUnits("100", 6)]);
    calldata = wallet.interface.encodeFunctionData("normalExecute", [targetERC20, 0, erc20ApproveData, 0]);

    userOp = await generateUserOp({
        signer: signer1,
        walletAddress: walletAddress,
        callData: calldata,
    });
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: multisigValidator,
        signers: [signer1, signer2],
        payMasterURL: paymasterURL,
        gasToken: targetERC20,
    });

    console.log("===============set spending limit===============");
    let configs = [
        {
            tokenAddress: ethers.constants.AddressZero,
            allowanceAmount: parseEther("100"),
            resetBaseTimeMinutes: 30,
            resetTimeIntervalMinutes: 30,
        },
    ];
    let spendingLimitInitData = abiCoder.encode(
        [
            "tuple(address tokenAddress,uint256 allowanceAmount,uint32 resetBaseTimeMinutes,uint16 resetTimeIntervalMinutes)[]",
        ],
        [configs]
    );
    let enableData = wallet.interface.encodeFunctionData("enableHooks", [spendingLimitAddress, spendingLimitInitData]);
    calldata = wallet.interface.encodeFunctionData("sudoExecute", [walletAddress, 0, enableData, 0]);
    userOp = await generateUserOp({
        signer: signer1,
        walletAddress: walletAddress,
        callData: calldata,
    });

    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: multisigValidator,
        signers: [signer1, signer2],
    });

    console.log("===============diable spending limit=============");
    let disableHooksData = wallet.interface.encodeFunctionData("disableHooks", [
        AddressOne,
        AddressOne,
        spendingLimitAddress,
    ]);

    console.log("is hooks enabled", await wallet.isHooksEnabled(spendingLimitAddress));
    calldata = wallet.interface.encodeFunctionData("sudoExecute", [walletAddress, 0, disableHooksData, 0]);
    userOp = await generateUserOp({
        signer: signer1,
        walletAddress: walletAddress,
        callData: calldata,
    });

    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: multisigValidator,
        signers: [signer1, signer2],
    });
}
