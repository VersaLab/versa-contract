pragma solidity ^0.8.17;

import "../contracts/plugin/validator/ECDSAValidator.sol";
import "../contracts/plugin/validator/MultiSigValidator.sol";

contract Deployer {
    bytes public deployBytecode;
    address public deployedAddr;

    bytes public ecdsaValidator = type(ECDSAValidator).creationCode;
    bytes public multisigValidator = type(MultiSigValidator).creationCode;

    function deploy(bytes memory code) public {
        deployBytecode = code;
        address a;
        // Compile Dumper to get this bytecode
        bytes memory dumperBytecode = type(Dumper).creationCode; //hex'6080604052348015600f57600080fd5b50600033905060608173ffffffffffffffffffffffffffffffffffffffff166331d191666040518163ffffffff1660e01b815260040160006040518083038186803b158015605c57600080fd5b505afa158015606f573d6000803e3d6000fd5b505050506040513d6000823e3d601f19601f820116820180604052506020811015609857600080fd5b81019080805164010000000081111560af57600080fd5b8281019050602081018481111560c457600080fd5b815185600182028301116401000000008211171560e057600080fd5b50509291905050509050805160208201f3fe';
        assembly {
            a := create2(0, add(0x20, dumperBytecode), mload(dumperBytecode), 0x9453)
            // create2(amount, add(bytecode, 0x20), mload(bytecode), salt)
        }
        deployedAddr = a;
    }

    function deploy1() public {
        deploy(ecdsaValidator);
        // deploy(multisigValidator);
    }

    function deploy2() public {
        // deploy(ecdsaValidator);
        deploy(multisigValidator);
    }
}

contract Dumper {
    constructor() {
        Deployer dp = Deployer(msg.sender);
        bytes memory bytecode = dp.deployBytecode();
        assembly {
            return(add(bytecode, 0x20), mload(bytecode))
        }
    }
}
