// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

error TestError(uint256 errorCode);
error TestErrorWithMultiPara(uint256 errorCode, uint256 errorPara1, uint256 errorPara2, uint256 errorPara3);
error TestErrorWithoutPara();

contract TestRevert {
    function testRevert(uint256 revertMode) external pure returns (uint256) {
        if (revertMode == 0) {
            revert();
        } else if (revertMode == 1) {
            revert TestError(1);
        } else if (revertMode == 2) {
            revert TestErrorWithoutPara();
        } else if (revertMode == 3) {
            revert TestErrorWithMultiPara(3, 1, 2, 3);
        } else if (revertMode == 4) {
            revert("test revert string");
        } else if (revertMode == 5) {
            return uint256(0) - 1;
        }
        return 0;
    }
}