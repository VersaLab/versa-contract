// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "@aa-template/contracts/interfaces/IEntryPoint.sol";
import "../common/SelfAuthorized.sol";

abstract contract EntryPointManager is SelfAuthorized {
    /**
     * @dev The ERC-4337 entrypoint address, it's hardcoded in implementation
     * contract for gas efficiency. Upgrading to a new version of entrypoint
     * requires replacing the implementation contract
     */
    address private immutable _entryPoint;

    modifier onlyFromEntryPoint() {
        _requireFromEntryPoint();
        _;
    }

    constructor(address newEntryPoint) {
        _entryPoint = newEntryPoint;
    }

    /**
     * ensure the request comes from the known entrypoint.
     */
    function _requireFromEntryPoint() internal view virtual {
        require(msg.sender == _entryPoint, "account: not from EntryPoint");
    }

    /**
     * Helper for wallet to get the next nonce.
     */
    function getNonce(uint192 key) public view returns (uint256) {
        return IEntryPoint(_entryPoint).getNonce(address(this), key);
    }

    /**
     * Get the entrypoint address
     */
    function entryPoint() public view returns (address) {
        return _entryPoint;
    }
}
