// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

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
        require(msg.sender == _entryPoint, "E100");
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

    /**
     * @dev Sends the missing funds for this transaction to the entry point (msg.sender).
     * Subclasses may override this method for better funds management
     * (e.g., send more than the minimum required to the entry point so that in future transactions
     * it will not be required to send again).
     * @param missingAccountFunds The minimum value this method should send to the entry point.
     * This value may be zero in case there is enough deposit or the userOp has a paymaster.
     */
    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            // Note: May pay more than the minimum to deposit for future transactions
            (bool success, ) = payable(entryPoint()).call{ value: missingAccountFunds, gas: type(uint256).max }("");
            (success);
            // Ignore failure (it's EntryPoint's job to verify, not the account)
        }
    }
}
