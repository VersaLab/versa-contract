import { BigNumber } from "ethers";
import { hexConcat, hexlify, RLP, keccak256 } from "ethers/lib/utils";
import { string } from "hardhat/internal/core/params/argumentTypes";
import { AbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";

export interface SpendingLimit {
    token: string;
    allowance: BigNumber | number;
}

export interface Session {
    to: string;
    selector: string;
    allowedArguments: string[][];
}

export interface Permission {
    sessionRoot: string;
    paymaster: string;
    validUntil: number;
    validAfter: number;
    gasRemaining: BigNumber;
    timesRemaining: BigNumber;
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
    ];
    return session;
}

export function getSessionSigleExecuteSignature(
    sessionKeyValidatorAddress: string,
    proof: string[],
    operatorAddress: string,
    session: string[],
    rlpCalldata: string,
    operatorSignature: string,
) {
    let abiCoder = new AbiCoder();
    const signature = hexConcat([
        sessionKeyValidatorAddress,
        abiCoder.encode(
            [
                "bytes32[]",
                "address",
                "tuple(address, bytes4, bytes)",
                "bytes",
                "bytes"
            ],
            [
                proof,
                operatorAddress,
                session,
                rlpCalldata,
                operatorSignature
            ]
        ),
    ]);
    return signature;
}

export function getSessionBatchExecuteSignature(
    sessionKeyValidatorAddress: string,
    proof: string[][],
    operatorAddress: string,
    session: string[][],
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
                "tuple(address, bytes4, bytes)[]",
                "bytes[]",
                "bytes"
            ],
            [
                proof,
                operatorAddress,
                session,
                rlpCalldata,
                operatorSignature
            ]
        ),
    ]);
    return signature;
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
