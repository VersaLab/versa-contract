<div align="center">
  <h1 align="center">Versa Wallet Contracts</h1>
</div>

[![Lint](https://github.com/VersaLab/versa-contract/actions/workflows/lint.yml/badge.svg)](https://github.com/VersaLab/versa-contract/actions/workflows/lint.yml)
[![Tests](https://github.com/VersaLab/versa-contract/actions/workflows/tests.yml/badge.svg)](https://github.com/VersaLab/versa-contract/actions/workflows/tests.yml)
[![Coverage Status](https://coveralls.io/repos/github/VersaLab/versa-contract/badge.svg?branch=main)](https://coveralls.io/github/VersaLab/versa-contract?branch=main)

## Introduction

With the emergence of ERC-4337, the crypto landscape is witnessing a dramatic shift, sparking off new possibilities in the domain of smart contract wallets. This breakthrough is redefining the very idea of what a wallet can be, bringing us one step closer to a truly seamless Web3 experience.

Amid this evolution, we introduce Versa Wallet. Designed with the principles of versatility at its core, Versa Wallet strikes a unique balance - it is both accessible to everyday users and easily extendable for advanced applications. This dual nature is the cornerstone of our design philosophy, allowing us to cater to a broad range of user needs.

At its core, without any additional plug-ins, Versa Wallet functions as a streamlined, easy-to-use wallet that offers all the functions of an externally owned account (EOA). It's straightforward and efficient, making it an excellent choice for those seeking a simple, high-performance wallet.

But where Versa Wallet truly shines is in its extendability. Users can easily activate a variety of plug-ins, which add layers of functionality and customization to the wallet. These plug-ins can assist with identity verification through transactions, provide an extra layer of security by guarding your transactions, and even add custom logic to your transactions like schedule your transactions(those days staying up late to mint the new NFT collections could be gone).

## Contract structure

:warning: This section requires you to be familiar with ERC-4337 and solidity.

Our contract architecture is designed as depicted in the following diagram：

![](https://hackmd.io/_uploads/SJfTJ8-Kn.png)


Let's dig in. So in Versa Wallet, we have three main components: Validator, Hook, and Module.

A Validator is a contract that validates the signature of a UserOp. When entrypoint calls the wallet for validateUserOp function, the wallet would go to ask the validator that UserOp specifies. This allows us to easily add any kind of key verification logic to our wallet. Currently we have the simple ECDSA validator, multi-sig validator and the time-delayed version of those two (to schedule your transaction). We would be adding session-key validator, secure enclave validator of IOS and passkey validator based on webauthn.

We have two types of validator: normal validator and sudo validator. The normal validator cannot touch the wallet's and other validator's storage, and cannot do delegate call. This means that only the sudo validator can enable or disable other validator. And all the txs coming out from normal validator would have to first go through another component: Hooks.

![Work flow to validate an UserOp](https://hackmd.io/_uploads/rk6u2SbF2.png)



A Hook is a contract that you can use to add custom logic before and after your transaction. Currently we have implemented a spending limit hook to serve as a risk control element. It would check your daily spending and revert it if you have exceeds your pre-set spending limit. Transactions coming out from sudo validator would not have to go through hooks. So imagine you use your local-stored key as a normal validator and use the multi-sig and secure-enclave as sudo validator. You can perform daily trading use your local key on a spending limit, and if you want to use a lot of money, you can use the key stored more safely in your secure chip or your multi-sig. It also prevents your fund from being drained when your local key is compromised (which happens a lot, sadly). With the combination of different level of validator and hooks, we are confident that we are bringing the most balance between convinience of daily spending and the safety of wealth storage.

Lastly, we have the module components. That's pretty much like the safe's module design. You can use module to add any logic to your wallet. This is the ultimate backup for extendability. Because the validator and hooks have already serve to add custom logic for verifing and transaction checking, we expect modules to only be used for advanced developers to do fancy functions like on-chain automatic arbitrages and so on.

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
