import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { hexlify, hexConcat, arrayify, parseEther, parseUnits, solidityPack } from "ethers/lib/utils";
import mumbaiAddresses from "../deploy/addresses/polygonMumbai.json";
import scrollSepoliaAddresses from "../deploy/addresses/scrollSepolia.json";
import { generateWalletInitCode } from "../test/utils";
import { AddressOne } from "../@safe-contracts/src";
import { estimateGasAndSendUserOpAndGetReceipt, generateUserOp, sleep } from "./utils/bundler";
import * as config from "./utils/config";
import * as constants from "../deploy/helper/config";

const bundlerURL = config.mumbaiBundlerURL;
const paymasterURL = config.mumbaiPaymasterURL;
const entryPointAddress = constants.deployConfig.entryPointAddress;

const paymasterAddress = mumbaiAddresses.versaVerifyingPaymaster;
const spendingLimitAddress = mumbaiAddresses.spendingLimitHooks;
const versaAccountFactoryAddress = mumbaiAddresses.versaAccountFactory;
const ecdsaValidator = mumbaiAddresses.ecdsaValidator;
const multisigValidator = mumbaiAddresses.multisigValidator;
const targetERC20 = config.mumbaiUSDTAddress;

// const bundlerURL = config.scrollSepoliaBundlerURL;
// const paymasterURL = config.scrollSepoliaPaymasterURL;
// const entryPointAddress = scrollSepoliaAddresses.entryPoint;
// const paymasterAddress = scrollSepoliaAddresses.versaVerifyingPaymaster;
// const versaAccountFactoryAddress = scrollSepoliaAddresses.versaAccountFactory;
// const spendingLimitAddress = scrollSepoliaAddresses.spendingLimitHooks;
// const ecdsaValidator = scrollSepoliaAddresses.ecdsaValidator;
// const multisigValidator = scrollSepoliaAddresses.multisigValidator;
// const targetERC20 = config.scrollSepoliaUSDTAddress;

const salt = config.salt;

/** This test covers:
 * 1. Base functions:
 *      - create a new wallet
 *      - test native tokens sending
 *      - test native tokens receiving(CompabilityFallbackHandler)
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

async function integration_test() {
    let [signer1, signer2, signer3, signer4] = await ethers.getSigners();
    let abiCoder = new ethers.utils.AbiCoder();
    const addr = await signer1.getAddress();
    const versaAccountFactory = await ethers.getContractAt("VersaAccountFactory", versaAccountFactoryAddress);
    const validatorInitdata = abiCoder.encode(["address"], [addr]);
    let { initCode, walletAddress } = await generateWalletInitCode({
        versaFacotryAddr: versaAccountFactory.address,
        salt,
        sudoValidator: ecdsaValidator,
        sudoValidatorInitData: validatorInitdata,
    });
    const wallet = await ethers.getContractAt("VersaWallet", walletAddress);

    console.log("============deploy new wallet=================");
    let calldata = wallet.interface.encodeFunctionData("normalExecute", [
        signer2.address,
        parseEther("0.0001"),
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
    let batchData = [];

    // test NativeTokenSending
    batchData.push([signer1.address, parseEther("0.0001"), "0x", 0]);

    // test NativeTokenReceive
    batchData.push([walletAddress, parseEther("0.0001"), "0x", 0]);

    // set new ecdsa signer
    let ECDSA = await ethers.getContractAt("ECDSAValidator", ecdsaValidator);
    let setSignerData = ECDSA.interface.encodeFunctionData("setSigner", [signer2.address]);
    batchData.push([ecdsaValidator, 0, setSignerData, 0]);

    // add multi-sig validator
    let enableMultisigInitData = abiCoder.encode(["address[]", "uint256"], [[signer1.address, signer2.address], 2]);
    let enableMultisigValidator = wallet.interface.encodeFunctionData("enableValidator", [
        ethers.utils.solidityPack(
            ["address", "uint8", "bytes"],
            [multisigValidator, 1, enableMultisigInitData]
        )
    ]);
    batchData.push([walletAddress, 0, enableMultisigValidator, 0]);

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

    let validatorType1 = await wallet.getValidatorType(ecdsaValidator);
    let validatorType2 = await wallet.getValidatorType(multisigValidator);
    if (validatorType1 !== 1 || validatorType2 !== 1) {
        throw new Error("Set validator type failed");
    }

    console.log("===============scheduled transaction=============");
    calldata = wallet.interface.encodeFunctionData("normalExecute", [signer1.address, parseEther("0.0001"), "0x", 0]);
    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: ecdsaValidator,
        signers: [signer2],
        scheduled: true,
    });

    console.log("=============== paymaster transaction =============");
    const ERC20 = await ethers.getContractAt("IERC20", targetERC20);
    if ((await ERC20.balanceOf(walletAddress)).lt(parseUnits("0.1", 6))) {
        console.log("insufficient erc20 token balance, transferring...");
        let tx = await ERC20.connect(signer1).transfer(walletAddress, parseUnits("1", 6));
        await tx.wait();
    }
    let erc20ApproveData = ERC20.interface.encodeFunctionData("approve", [paymasterAddress, parseUnits("1", 6)]);
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
        validator: ecdsaValidator,
        signers: [signer2],
        paymasterURL: paymasterURL,
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
    let enableData = wallet.interface.encodeFunctionData("enableHooks", solidityPack(["address", "bytes"],[spendingLimitAddress, spendingLimitInitData]));
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
        validator: ecdsaValidator,
        signers: [signer2],
    });

    console.log("===============diable spending limit=============");
    let disableHooksData = wallet.interface.encodeFunctionData("disableHooks", [
        AddressOne,
        AddressOne,
        spendingLimitAddress,
    ]);
    console.log("is hooks enabled: ", await wallet.isHooksEnabled(spendingLimitAddress));
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
        validator: ecdsaValidator,
        signers: [signer2],
    });

    console.log("===============disable validator=============");
    // Validate through ecdsa validator and disable multisig validator
    let disableData = wallet.interface.encodeFunctionData("disableValidator", [ecdsaValidator, multisigValidator]);
    calldata = wallet.interface.encodeFunctionData("sudoExecute", [walletAddress, 0, disableData, 0]);
    userOp = await generateUserOp({ signer: signer1, walletAddress, callData: calldata });
    // test scheduled transaction here
    await estimateGasAndSendUserOpAndGetReceipt({
        bundlerURL,
        userOp,
        entryPoint: entryPointAddress,
        validator: ecdsaValidator,
        signers: [signer2],
    });
    const multisigValidatorType = await wallet.getValidatorType(multisigValidator);
    if (multisigValidatorType !== 0) {
        throw new Error("Disable validator failed");
    }
}

integration_test()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
