import { BigNumber } from "ethers";
import { hexConcat, hexlify, RLP, keccak256 } from "ethers/lib/utils";
import { string } from "hardhat/internal/core/params/argumentTypes";
import { AbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

export interface Session {
    to: string;
    selector: string;
    allowedArguments: string[][];
    paymaster: string;
    validUntil: number | BigNumber;
    validAfter: number | BigNumber;
    timesLimit: number | BigNumber;
}

type PrefixValue = "0x00" | "0x01" | "0x02" | "0x03" | "0x04" | "0x05" | "0x06";

export const ANY: PrefixValue = "0x00";
export const NE: PrefixValue = "0x01";
export const EQ: PrefixValue = "0x02";
export const GT: PrefixValue = "0x03";
export const LT: PrefixValue = "0x04";
export const AND: PrefixValue = "0x05";
export const OR: PrefixValue = "0x06";

export const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

export function buildSession(sessionItem: Session) {
    let session = [
        sessionItem.to,
        ethers.utils.id(sessionItem.selector).substring(0, 10),
        RLP.encode(sessionItem.allowedArguments),
        sessionItem.paymaster,
        sessionItem.validUntil,
        sessionItem.validAfter,
        sessionItem.timesLimit,
    ];
    return session;
}

export function getSession(options: {
    to?: string;
    selector?: string;
    allowedArguments?: string;
    paymaster?: string;
    validUntil?: number | BigNumber;
    validAfter?: number | BigNumber;
    timesLimit?: number | BigNumber;
}) {
    const {
        to = ethers.constants.AddressZero,
        selector = "0x00000000",
        allowedArguments = "0x",
        paymaster = ethers.constants.AddressZero,
        validUntil = 0,
        validAfter = 0,
        timesLimit = 0,
    } = options;
    return {
        to,
        selector,
        allowedArguments,
        paymaster,
        validUntil,
        validAfter,
        timesLimit,
    };
}

export function buildSessionTree(leaves: any) {
    const tree = StandardMerkleTree.of(leaves, [
        "address",
        "bytes4",
        "bytes",
        "address",
        "uint48",
        "uint48",
        "uint256",
    ]);
    return tree;
}

export function getSessionSigleExecuteSignature(
    sessionKeyValidatorAddress: string,
    proof: string[],
    operatorAddress: string,
    session: (string | number | BigNumber)[],
    rlpCalldata: string,
    operatorSignature: string
) {
    let abiCoder = new AbiCoder();
    const signature = hexConcat([
        sessionKeyValidatorAddress,
        abiCoder.encode(
            [
                "bytes32[]",
                "address",
                "tuple(address, bytes4, bytes, address, uint48, uint48, uint256)",
                "bytes",
                "bytes",
            ],
            [proof, operatorAddress, session, rlpCalldata, operatorSignature]
        ),
    ]);
    return signature;
}

export function getSessionBatchExecuteSignature(
    sessionKeyValidatorAddress: string,
    proof: string[][],
    operatorAddress: string,
    session: (string | number | BigNumber)[][],
    rlpCalldata: string[],
    operatorSignature: string
) {
    let abiCoder = new AbiCoder();
    const signature = hexConcat([
        sessionKeyValidatorAddress,
        abiCoder.encode(
            [
                "bytes32[][]",
                "address",
                "tuple(address, bytes4, bytes, address, uint48, uint48, uint256)[]",
                "bytes[]",
                "bytes",
            ],
            [proof, operatorAddress, session, rlpCalldata, operatorSignature]
        ),
    ]);
    return signature;
}

export function packValidationData(sigFailed: number, validUntil: number, validAfter: number): number {
    return sigFailed | (validUntil << 160) | (validAfter << (160 + 48));
}

export class argumentItem {
    public prefix: PrefixValue;
    public type: string;
    public value: any;
    public rlpItem: [PrefixValue, string];
    public abiItem: string;

    constructor(prefix: PrefixValue, type: string, value: any) {
        this.prefix = prefix;
        this.type = type;
        this.value = value;

        let abiCoder = new AbiCoder();
        this.rlpItem = [this.prefix, abiCoder.encode([this.type], [this.value])];
        this.abiItem = abiCoder.encode([this.type], [this.value]);
    }
}
