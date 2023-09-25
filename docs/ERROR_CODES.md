**Initialization related**

- `E000: Invalid initdata`

**Auth related**

- `E100：Caller is not the entrypoint`
- `E101: Only self call is allowed`
- `E102: Transaction is sudo while validator is normal`
- `E103: Operation is not allowed in normal transaction`
- `E104: Versa: invalid validator`
- `E105: Versa: invalid batch data`

**Signature verification related**

- `E200: Signed message can only be verified by sudo validator`
- `E201: Invalid scheduled transaction fee`
- `E202: Invalid signature type`
- `E203: Invalid signature length`
- `E204: Invalid signer address`
- `E205: Signatures data too short`
- `E206: Inside static part`
- `E207: Contract signatures out of bounds`
- `E208: Contract signature wrong offset`
- `E209: Contract signature invalid`
- `E210: Guardian is not ordered or invalid guardian`
- `E211: Given validator is no enabled by the wallet`

**Manager related**

- `E300: FallbackManager: fallback handler cannot be wallet itself`
- `E301: HooksManager: hook data length must be ≥ 20 bytes to enable hooks`
- `E302: HooksManager: not a valid hooks contract`
- `E303: ModuleManager: caller is not an enabled module`
- `E304: ModuleManager: module data length must be ≥ 20 bytes to enable a module`
- `E305: ModuleManager: not a valid module contract`
- `E306: ValidatorManager: given validator type is not valid`
- `E307: ValidatorManager: validator data length must be ≥ 21 bytes to enable a validator`
- `E308: ValidatorManager: not a valid validator contract`
- `E309: ValidatorManager: the validator has already been added`
- `E310 : ValidatorManager: validator doesn't exist`
- `E311: ValidatorManager: cannot remove the last remaining sudoValidator`

**Hooks related**

- `E400: Hooks: this hooks is not enabled`
- `E401: SpendingLimitHooks: token overspending`
- `E402: SpendingLimitHooks: delegatecall is not allowed`
- `E403: SpendingLimitHooks: parse error`
- `E404: SpendingLimitHooks: invalid reset time interval`
- `E405: SpendingLimitHooks: resetBaseTimeMinutes can not greater than currentTimeMinutes`
- `E406: SpendingLimitHooks: dataLength should greater than zero`
- `E407: SpendingLimitHooks: afterTransaction hook is not allowed`

**Validator related**

- `E500: Validator is not enabled`
- `E501: ECDSAValidator: invalid signer of the wallet`
- `E502: MultiSigValidator: must have at least one guardian`
- `E503: MultiSigValidator: hash already approved`
- `E504: MultiSigValidator: hash is not approved`
- `E505: MultiSigValidator: guardian is already added`
- `E506: MultiSigValidator: invalid guardian address`
- `E507: MultiSigValidator: not a valid guardian of the wallet`
- `E508: MultiSigValidator: threshold cannot be 0`
- `E509: MultiSigValidator: threshold must be lower or equal to guardians count`
- `E510: SessionKeyValidator: invalid wallet operation`
- `E511: SessionKeyValidator: unsupported`
- `E512: SessionKeyValidator: gas fee exceeds remaining gas`
- `E513: SessionKeyValidator: invalid batch length`
- `E514: SessionKeyValidator: exceed usage`
- `E515: SessionKeyValidator: rlpCalldata is not equally encoded from execution data`
- `E516: SessionKeyValidator: invalid to`
- `E517: SessionKeyValidator: invalid selector`
- `E518: SessionKeyValidator: invalid arguments`
- `E519: SessionKeyValidator: invalid paymaster`
- `E520: SessionKeyValidator: invalid session root`
- `E521: SessionKeyValidator: invalid validation duration`
- `E522: SessionKeyValidator: invalid arguments length`
- `E523: SessionKeyValidator: msg.value not corresponding to parsed value`
- `E524: SessionKeyValidator: invalid calldata prefix`

**Module related**

**Proxy related**

- `E700: VersaProxy: invalid singleton address provided`
- `E701: ProxyFactory: singleton contract not deployed`
- `E702: ProxyFactory: create2 call failed`

**Other libs related**

- `E800: AddressLinkedList: invalid address`
- `E801: AddressLinkedList: address already exists`
- `E802: AddressLinkedList: address not exists`
- `E803: AddressLinkedList: new address already exists`
- `E804: AddressLinkedList: Invalid prev address`