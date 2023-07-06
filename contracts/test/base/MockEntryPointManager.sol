// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../../base/EntryPointManager.sol";

contract MockEntryPointManager is EntryPointManager {
    constructor(address _entryPoint) EntryPointManager(_entryPoint) {}

    function checkFromEntryPoint() public view onlyFromEntryPoint {}
}
