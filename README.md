<div align="center">
  <h1 align="center">Versa Wallet Contracts</h1>
</div>

[![Lint](https://github.com/VersaLab/versa-contract/actions/workflows/lint.yml/badge.svg)](https://github.com/VersaLab/versa-contract/actions/workflows/lint.yml)
[![Tests](https://github.com/VersaLab/versa-contract/actions/workflows/tests.yml/badge.svg)](https://github.com/VersaLab/versa-contract/actions/workflows/tests.yml)

## Introduction

With the emergence of ERC-4337, the crypto landscape is witnessing a dramatic shift, sparking off new possibilities in the domain of smart contract wallets. This breakthrough is redefining the very idea of what a wallet can be, bringing us one step closer to a truly seamless Web3 experience.

Amid this evolution, we are proud to introduce Versa Wallet. Versa employs an innovative design to optimize the beauty of account abstraction while also providing robust security and customizable automation features. 

With versatility at its heart, Versa strikes a unique balance between: 
- Accesibility to everyday users, and
- Extendibility for advanced applications and developers

This dual nature is the cornerstone of our design philosophy, allowing us to cater to a broad range of user needs.

Without any plug-ins, Versa functions as a streamlined, easy-to-use wallet that offers all the functions of an externally owned account (EOA). But where Versa truly shines is in its extendibility. Users can easily activate a variety of plug-ins, which add layers of functionality and customization to the wallet. These plug-ins can assist with identity verification through transactions, provide an extra layer of security by guarding your transactions, and even add custom logic to your transactions, such as scheduling them for convenient times.

## Versa's smart contract structure

Our contract architecture is designed as depicted in the following diagram：

![](https://hackmd.io/_uploads/H1A6kJTt3.png)

In Versa Wallet, we have five main components: EntryPointManager, ValidatorManager, HooksManager, ModuleManager and FallbackManager.

EntryPointManager is responsible for implementing compatibility with the ERC-4337 standard. ValidatorManager, ModuleManager, and HooksManager serve as powerful management components for Versa's comprehensive plug-in system. FallbackManager empowers the Versa wallet with unparalleled extensibility, enabling the implementation of advanced native functionalities.

The following diagram illustrates the complete lifecycle of different type of transactions in the Versa wallet based on the ERC-4337 protocol:

![](https://hackmd.io/_uploads/BJH1IqRt2.png)

:warning: The following section requires you to be familiar with ERC-4337 and solidity.

### Validators

A Validator is a contract that validates the signature of a UserOp. When EntryPoint calls the wallet for validateUserOp function, the wallet would go to ask the validator that UserOp specifies. This allows us to easily add any kind of key verification logic to our wallet. Currently, we have the simple ECDSA validator, multi-sig validator and the time-delayed version of those two (to schedule your transaction). We will also add session-key validator, secure enclave validator of IOS and passkey validator based on webauthn.

We designed two types of validator: ***normal validator*** and ***sudo validator***. The normal validator cannot access the storage of the wallet and other validators, and cannot do delegate calls. This means that only the sudo validator can enable or disable other validator. And all the transactions coming out from normal validator would have to first go through another component: Hooks.

![Work flow to validate an UserOp](https://hackmd.io/_uploads/r1LG4J6t2.png)

### Hooks

A Hook is a contract that user can use to add custom logic before and after the execution of normal transactions. Hooks can perform checks on the transaction logic, such as the receipient address, called function selectors and parameters, as well as modifications in wallet state, such as token balance. If any condition set by the Hooks is not met, the Hooks will throw an error, causing the wallet to reject the transaction. The introduction of Hooks provides additional security protection for the wallet.

Additionally, a wallet can add multiple Hooks, and these Hooks operate independently without interfering with each other, which we believe will bring convenience to third-party Hooks developers.

As an example, we have implemented SpendingLimitHooks that allows users to set daily usage limits for native token and ERC20 tokens. Before each normal transaction, SpendingLimitHooks checks and updates the token usage. If the pre-set limit is exceeded, the user needs to use a sudo validator, such as the multi-sig validator, to authorize the token usage(as sudo transactions would not have to go through hooks). This design ensures the security of your high-value assets while maintaining a good user experience for you day-to-day usage.

### Modules

The Module component is the last piece of the puzzle to a butter-like spending experience. Versa owners can use this sophisticated component to add any logic to their wallet and feed Modules with offchain data and onchain functions. For users with advanced needs, Modules make it possible to bridge their everyday Web2 experience and the Web3 capacities. With Modules, the list of Versa use cases only stops with developers' imagination. If you are familiar with other AA wallets,  our Module design is pretty much like the Safe's. 

In Versa, Module is the ultimate backup for extendibility. As the Validator and Hooks have already serve to add custom logic for verifing and transaction checking, we expect Modules to be the advanced option for developers to do fancy functions like onchain automatic arbitrages and so on. To avoid any malicious Modules, Versa is dedicated to reviewing any implication with the closest attention.

Usage
-----
### Install requirements with yarn:

```bash
yarn
```

### Run all tests:

```bash
yarn compile
yarn test
```
