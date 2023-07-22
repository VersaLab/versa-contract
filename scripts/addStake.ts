import { keccak256, parseEther } from "ethers/lib/utils";
import mumbaiAddresses from "../deploy/addresses/mumbai.json";
import { ethers } from "hardhat";
import * as config from "../deploy/helper/constants";

async function addStake() {
    const factory = await ethers.getContractAt("VersaAccountFactory", mumbaiAddresses.versaAccountFactory);
    let tx = await factory.addStake(1, { value: 1 });
    await tx.wait();

    // let abiCoder = new ethers.utils.AbiCoder
    // let slot =  1
    // let key = "0x4E74f16A61DF2D4Ae09CAA2D7Fa2E6Dd348a0EA5"
    // console.log(keccak256(abiCoder.encode(['address','uint256'],[key,slot])))

    let entryPoint = await ethers.getContractAt("IEntryPoint", config.mumbaiConfig.entryPoint);

    let stakeInfo = await entryPoint.getDepositInfo(factory.address);
    console.log(stakeInfo);
}

addStake()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// // native transfer
// calldata = wallet.interface.encodeFunctionData("normalExecute", [
//     signer1.address,
//     parseEther("0.00001"),
//     "0x",
//     0,
// ])
// userOp = await generateUserOp({ signer: signer1, walletAddress: walletAddress, callData: calldata });
// await estimateGasAndSendUserOpAndGetReceipt({
//     bundlerURL,
//     userOp,
//     entryPoint: entryPointAddress,
//     validator: ecdsaValidator,
//     signers: [signer1],
// });

// // erc20 transfer
// let ERC20Token = await ethers.getContractAt("IERC20", targetERC20);
// if ((await ERC20Token.balanceOf(walletAddress)).lt(parseUnits("1", 6))) {
//     console.log("insufficient erc20 token balance, transferring...");
//     let tx = await ERC20Token.connect(signer1).transfer(walletAddress, parseUnits("2", 6));
//     await tx.wait();
// }
// let erc20TransaferData = ERC20Token.interface.encodeFunctionData("transfer", [signer1.address, parseUnits("2", 6)])
// calldata = wallet.interface.encodeFunctionData("normalExecute", [
//     ERC20Token.address,
//     0,
//     erc20TransaferData,
//     0,
// ])
// userOp = await generateUserOp({ signer: signer1, walletAddress: walletAddress, callData: calldata });
// await estimateGasAndSendUserOpAndGetReceipt({
//     bundlerURL,
//     userOp,
//     entryPoint: entryPointAddress,
//     validator: ecdsaValidator,
//     signers: [signer1],
// });

// nft transfer

// swap
