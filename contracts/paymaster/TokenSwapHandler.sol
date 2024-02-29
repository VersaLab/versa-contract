// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "./interfaces/IUniswapRouter.sol";
import "./interfaces/IWETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

abstract contract TokenSwapHandler {
    using SafeERC20 for IERC20;
    address public v2SwapRouter02;
    address public v3SwapRouter02;

    IWETH public immutable WETH;

    constructor(address _v2SwapRouter02, address _v3SwapRouter02, IWETH _weth) {
        _setSwapRouter(_v2SwapRouter02, _v3SwapRouter02);
        WETH = _weth;
    }

    function _setSwapRouter(address _v2SwapRouter02, address _v3SwapRouter02) internal virtual {
        v2SwapRouter02 = _v2SwapRouter02;
        v3SwapRouter02 = _v3SwapRouter02;
    }

    function _approveRouter(IERC20[] calldata tokens, uint256[] calldata amount) internal virtual {
        uint256 len = tokens.length;
        require(len == amount.length, "TokenSwapHandler: Invalid para length");

        for (uint256 i; i < len; ++i) {
            tokens[i].safeApprove(v2SwapRouter02, amount[i]);
            tokens[i].safeApprove(v3SwapRouter02, amount[i]);
        }
    }

    struct V2SwapParas {
        uint256 amountIn;
        uint256 amountOutMin;
        address[] path;
    }

    function _convert(V2SwapParas memory _swapInfo) internal returns (uint256) {
        IERC20 tokenIn = IERC20(_swapInfo.path[0]);
        if (_swapInfo.amountIn == type(uint256).max) {
            _swapInfo.amountIn = tokenIn.balanceOf(address(this));
        }
        uint256[] memory amounts = IUniswapV2Router02(v2SwapRouter02).swapExactTokensForETH(
            _swapInfo.amountIn,
            _swapInfo.amountOutMin,
            _swapInfo.path,
            address(this),
            block.timestamp
        );
        uint256 ethOut = amounts[amounts.length - 1];
        return ethOut;
    }

    struct V3SwapParas {
        bytes path;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function _convert(V3SwapParas calldata _swapInfo) internal returns (uint256) {
        address inputToken = address(bytes20(_swapInfo.path[:20]));
        address outPutToken = address(bytes20(_swapInfo.path[_swapInfo.path.length - 20:]));
        require(outPutToken == address(WETH), "TokenSwapHandler: Only to wnative token allowed");

        uint256 amountIn = _swapInfo.amountIn == type(uint256).max
            ? IERC20(inputToken).balanceOf(address(this))
            : _swapInfo.amountIn;

        uint256 amountOut = IUniswapV3Router02(v3SwapRouter02).exactInput(
            IUniswapV3Router02.ExactInputParams(_swapInfo.path, address(this), amountIn, _swapInfo.amountOutMinimum)
        );
        return amountOut;
    }
}
