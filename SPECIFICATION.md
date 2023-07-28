# Specification

## Core Contracts

The Versa Wallet is a smart contract wallet compatible with ERC-4337. It inherits the following base-class contracts:

### EntryPointManager

The EntryPointManager contract is an abstract contract that maintains the ERC-4337 EntryPoint contract address. It provides the `onlyFromEntryPoint` modifier to sub-classes and the `getNonce` function to allow external queries of the nonce. The nonce is managed by the EntryPoint contract rather than the Versa Wallet. For more details about the nonce management, refer to the [documentation](https://docs.google.com/document/d/1MywdH_TCkyEjD3QusLZ_kUZg4ZEI00qp97mBze9JI4k/edit#heading=h.gyhqxhuyd59n).

### ValidatorManager

The ValidatorManager contract is an abstract contract that maintains the list of enabled validators. In the Versa Wallet, we abstract the process of validating a userOperation and EIP-1271 signature into the `validator` class. The validators are classified as "sudo" or "normal" based on their security level. A user operation signature that passes the authentication of a sudo validator grants full access to the wallet, while a normal validator provides limited access. The EIP-1271 signature is only accepted by an enabled sudo validator as some permit will allow external contracts to have full access to the wallet assets(eg. some [ERC20 contracts with permit](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Permit)).

### HooksManager

The HooksManager contract is an abstract contract that maintains the list of enabled hooks. A Hook contract may provide one or both of the `beforeTransaction` and `aferTransaction` hooks being called before and after the main execution logic, consuming the `normalExecute` function's parameters, `to`, `value` and `data`. Thus a user can add custom logic to perform additional actions arount the execution logic.

### ModuleManager

The ModuleManager contract is an abstrat contract that maintains the list of enabled modules. The
ModuleManager allows extending wallet functionality through external module contracts by providing
the `execTransactionFromModule` function.

### FallbackManager

The FallbackManager maintains and forwards all un-recognized calls to the FallbackHandler contract,
allows add native functions to be added for the wallet.

### VersaWallet

In addition to the above base-class components, the VersaWallet contract implements the following functions:

- `validateUserOp`: the main entrance for validating an user operation called by the EntryPoint contract. It parses the the validator address from `UserOp.signature`, performs sanity checks and delegates the validation to the given validator contract.

- `normalExecute`: the main entrance for executing an user operation called by the EntryPoint contract. The following conditions are prohibited:
  - `to` is the address of the wallet itself
  - `to` is an enabled validator/hook/module contract
  - `operation` is `DELEGATECALL`

- `sudoExecute`: must be previously validated by a sudo valdiator, does not have any restrictions of the execution logic.

- `batchNormalExecute`: the batch version of `normalExecute` which allows to execute multiple actions in one user operation.

- `batchSudoExecute`: the batch version of `sudoExecute` which allows to execute multiple actions in one user operation.

## External Contracts

### ECDSAValidator

The ECDSAValidator contract is the default sudo validator of versa wallet. It allows the wallet to set an ECDSA signer and provides the ECDSA signature validation logic for user operation and EIP-1271 verification. It is supposed to be downgraded to normal after enabling higher-security level validators.

### MultiSigValidator

The MultiSigValidator contract is a multi-ECDSA-signature validator designed to be a sudo validator of the Versa Wallet. It requires a pre-set threshold of signatures to authenticate a user operation. It also provides EIP-1271 verification logic in `isValidSignature`.

### SessionKeyValidator

The SessionKeyValidator contract is designed to be a normal validator of versa wallet allowing users to delegate some of wallet access to third-party operators for specific uses such as auto-investing. An operator can be an EOA or a smart contract compatible with EIP-1271. A session has following properties which can be specified by the user:
- `to`: the address allowed to call
- `value`: the value allowed to send along with the call
- `functionSelector`: the function allowed to call
- `allowedArguments`: the arguments range allowed to pass to the function
  
An operator can hold multiple sessions of a wallet, and all the sessions of a wallet for a specific operator are organized as a Merkle tree and it's root is stored on-chain. Besides sessions, an user can also set other restrictions for an operator to minimize the risk, which we defined as `Permission`, including:
- `sessionRoot`: the merkle root of the sessions of the operator
- `paymaster`: the paymaster contract address that the operator is allowed to use
- `validUntil`: the timestamp when the permission is expired, 0 for infinite
- `validAfter`: the timestamp when the permission is valid
- `gasRemaining`: the gas limit for the operator
- `timeRemaining`: the times limit for the operator

The SessionKeyValidator contract allows the user to set an overall token allowance for the operator if the user doesn't care about the token amount consumed by individual sessions. The permission and token allowance configuration can be authorized by the wallet owner through an off-chain permit signature and later submitted on-chain by the operator along with the session key transaction.

### SpendingLimitHooks

The SpendingLimitHooks contract is a hook class instance allows users to set spending limit for different tokens and provide the `beforeTransaction` hooks that checks and updates the spending info of the normal executions.

### CompatibilityFallbackHandler

The CompatibilityFallbackHandler contract is the default fallback handler of versa wallet. It inherits the `TokenCallbackHandler` which handles common tokens' callbacks, and implements `isValidSignature` as the EIP-1271 signature validation entrance.
