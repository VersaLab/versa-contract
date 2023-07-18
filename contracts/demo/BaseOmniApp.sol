// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";

abstract contract BaseOmniApp is NonblockingLzApp {
    constructor(address _lzEndpoint) NonblockingLzApp(_lzEndpoint) {}

    function estimateNativeFee(uint16 _dstChainId, bytes calldata _payload) public view returns (uint256 _nativeFee) {
        (_nativeFee, ) = lzEndpoint.estimateFees(_dstChainId, address(this), _payload, false, bytes(""));
    }

    function _sendOmniMessage(uint16 _dstChainId, bytes memory _payload) internal {
        _lzSend(_dstChainId, _payload, payable(msg.sender), address(0), bytes(""), msg.value);
    }

    function _nonblockingLzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) internal virtual override {}

    function setRelayer(uint16 _dstChainId, address _sendRelayer, address _receiveRelayer) external onlyOwner {
        uint CONFIG_TYPE_RELAYER = 3;
        lzEndpoint.setConfig(
            lzEndpoint.getSendVersion(address(this)),
            _dstChainId,
            CONFIG_TYPE_RELAYER,
            abi.encode(_sendRelayer)
        );
        lzEndpoint.setConfig(
            lzEndpoint.getReceiveVersion(address(this)),
            _dstChainId,
            CONFIG_TYPE_RELAYER,
            abi.encode(_receiveRelayer)
        );
    }

    function getRelayer(uint16 _dstChainId) external view returns (address _sendRelayer, address _receiveRelayer) {
        uint CONFIG_TYPE_RELAYER = 3;
        bytes memory bytesSendRelayer = lzEndpoint.getConfig(
            lzEndpoint.getSendVersion(address(this)),
            _dstChainId,
            address(this),
            CONFIG_TYPE_RELAYER
        );
        assembly {
            _sendRelayer := mload(add(bytesSendRelayer, 32))
        }
        bytes memory bytesReceiveRelayer = lzEndpoint.getConfig(
            lzEndpoint.getReceiveVersion(address(this)),
            _dstChainId,
            address(this),
            CONFIG_TYPE_RELAYER
        );
        assembly {
            _receiveRelayer := mload(add(bytesReceiveRelayer, 32))
        }
    }

    function setOracle(uint16 _dstChainId, address _sendOracle, address _receiveOracle) external onlyOwner {
        uint CONFIG_TYPE_ORACLE = 6;
        lzEndpoint.setConfig(
            lzEndpoint.getSendVersion(address(this)),
            _dstChainId,
            CONFIG_TYPE_ORACLE,
            abi.encode(_sendOracle)
        );
        lzEndpoint.setConfig(
            lzEndpoint.getReceiveVersion(address(this)),
            _dstChainId,
            CONFIG_TYPE_ORACLE,
            abi.encode(_receiveOracle)
        );
    }

    function getOracle(uint16 _dstChainId) external view returns (address _sendOracle, address _receiveOracle) {
        uint CONFIG_TYPE_ORACLE = 6;
        bytes memory bytesSendOracle = lzEndpoint.getConfig(
            lzEndpoint.getSendVersion(address(this)),
            _dstChainId,
            address(this),
            CONFIG_TYPE_ORACLE
        );
        assembly {
            _sendOracle := mload(add(bytesSendOracle, 32))
        }
        bytes memory bytesReceiveOracle = lzEndpoint.getConfig(
            lzEndpoint.getReceiveVersion(address(this)),
            _dstChainId,
            address(this),
            CONFIG_TYPE_ORACLE
        );
        assembly {
            _receiveOracle := mload(add(bytesReceiveOracle, 32))
        }
    }
}
