// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

contract MockEntryPoint {
    uint256 private _nonce;

    function getNonce(address, uint192) external view returns (uint256) {
        return _nonce;
    }

    function setNonce(uint256 nonce) external {
        _nonce = nonce;
    }
}
