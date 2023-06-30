import { ethers } from "hardhat"
import { VersaWallet__factory, VersaAccountFactory__factory, MockValidator__factory, MockHooks__factory, MockModule__factory } from "../typechain-types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

export async function deployVersaWallet(options: {
        signer: SignerWithAddress,
        entryPoint: string,
    }) {

    const {
        signer,
        entryPoint,
        // sudoValidator,
        // sudoValidatorInitData,
        // hooks = [],
        // hooksInitData = [],
        // module = [],
        // moduleInitData = []
        } = options;

    let fallbackHandler = ethers.constants.AddressZero
    // Deploy versa singleton
    let versaWalletSingleton = await new VersaWallet__factory(signer).deploy(entryPoint)
    // Deploy VersaAccountFactory
    let versaFactory = await new VersaAccountFactory__factory(signer).deploy(
        versaWalletSingleton.address,
        fallbackHandler
    )

    let sudoValidator = await new MockValidator__factory(signer).deploy()

    let tx = await versaFactory.createAccount(
        [sudoValidator.address],
        ['0x'],
        [1],
        [],
        [],
        [],
        [],
        0
    )
    await tx.wait()
  
    let walletAddress = await versaFactory.getAddress(
        [sudoValidator.address],
        ['0x'],
        [1],
        [],
        [],
        [],
        [],
        0
    )
    return VersaWallet__factory.connect(walletAddress, signer)
}

export interface userOp {
    sender: string
    nonce: number
    initCode: string
    callData: string
    callGasLimit: number
    verificationGasLimit: number
    preVerificationGas: number
    maxFeePerGas: number
    maxPriorityFeePerGas: number
    paymasterAndData: string
}

export function getUserOpHash(op: userOp, entryPoint: string, chainId: number) {
    let hashInitCode = ethers.utils.keccak256(op.initCode)
    let hashCallData = ethers.utils.keccak256(op.callData)
    let hashPaymasterAndData = ethers.utils.keccak256(op.paymasterAndData)

    let abiCoder = new ethers.utils.AbiCoder

    let pack = abiCoder.encode(['address','uint256','bytes32','bytes32','uint256','uint256','uint256','uint256','uint256','bytes32'],
    [op.sender, op.nonce, hashInitCode, hashCallData, op.callGasLimit, op.verificationGasLimit, op.preVerificationGas, op.maxFeePerGas, op.maxPriorityFeePerGas,hashPaymasterAndData]
    )

    let hashPack = ethers.utils.keccak256(pack)
    return ethers.utils.keccak256(abiCoder.encode(['bytes32','address','uint256'], [hashPack, entryPoint, chainId]))
}
