// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "../../base/EntryPointManager.sol";

contract MockEntryPointManager is EntryPointManager {
    constructor(address _entryPoint) EntryPointManager(_entryPoint){}

    function checkFromEntryPoint() onlyFromEntryPoint public view {}
}