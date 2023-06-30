import { BigNumber } from "ethers";
import { MockHooksManager, MockModuleManager, MockValidatorManager, VersaWallet } from "../../typechain-types";
import { parseEther } from "ethers/lib/utils";
import { Buffer } from 'buffer';

export function numberToFixedHex(value: number, length: number): string {
  return '0x' + value.toString(16).padStart(length*2,'0')
}

export const SENTINEL = "0x0000000000000000000000000000000000000001"

export interface clase {
    traiA: string
}

export async function execute(options: {
    executor: MockHooksManager | MockModuleManager | MockValidatorManager | VersaWallet,
    to?: string,
    value?: BigNumber,
    data?: string,
    operation?: number,
  }) {
    const {
      executor,
      to = executor.address,
      value = parseEther("0"),
      data = "0x",
      operation = 0,
    } = options;

    let tx
    if (!isVersaWallet(executor)) {
        tx = await executor.execute(to, value, data, operation);
    } else {
        tx = await executor.sudoExecute(to, value, data, operation)
    }
    return tx
}

export async function enablePlugin(options: {
    executor: MockHooksManager | any,
    plugin: string,
    initData?: string,
    type?: number,
    selector?: string
}) {
    const {
        executor,
        plugin,
        initData = '0x',
        type = 1,
        selector = 'enableValidator'
    } = options;

    let data
    if (isHooksManager(executor)) {
        data = executor.interface.encodeFunctionData('enableHooks', [plugin, initData])
    } else if (isModuleManager(executor)) {
        data = executor.interface.encodeFunctionData('enableModule', [plugin, initData])
    } else if (isValidatorManger(executor)) {
        data = executor.interface.encodeFunctionData('enableValidator', [plugin, type, initData])
    }
    if (isVersaWallet(executor)){
        if (selector == 'enableValidator') {
            data = executor.interface.encodeFunctionData('enableValidator', [plugin, type, initData])
        } else {
            data = executor.interface.encodeFunctionData(selector, [plugin, initData])
        }
    }
    return await execute({executor, data})
}

export async function disablePlugin(
    executor: MockHooksManager | any,
    plugin: string,
) {
    let data
    if (isHooksManager(executor)) {
        let hooksSize = await executor.hooksSize()
        let preHooksList = await executor.getPreHooksPaginated(SENTINEL, hooksSize.beforeTxHooksSize)
        let afterHooksList = await executor.getPostHooksPaginated(SENTINEL, hooksSize.afterTxHooksSize)
        let prevBeforeTxHooks = getPrevPlugin(plugin, preHooksList)
        let afterBeforeTxHooks = getPrevPlugin(plugin, afterHooksList)
        data = executor.interface.encodeFunctionData('disableHooks', [prevBeforeTxHooks, afterBeforeTxHooks, plugin])
    } else if(isModuleManager(executor)) {
        let moduleSize = await executor.moduleSize()
        let modules = await executor.getModulesPaginated(SENTINEL, moduleSize)
        let prevModule = getPrevPlugin(plugin, modules)
        data = executor.interface.encodeFunctionData('disableModule', [prevModule, plugin])
    } else {
        let type = await executor.getValidatorType(plugin)
        let validatorSize  = await executor.validatorSize()
        let list
        let size = type == 1 ? validatorSize.sudoSize : validatorSize.normalSize
        list = await executor.getValidatorsPaginated(SENTINEL, size, type)
        let prevValidator = getPrevPlugin(plugin, list)
        data = executor.interface.encodeFunctionData('disableValidator', [prevValidator, plugin])
    }

    return await execute({executor, data})
}

export async function toggleValidator(
    executor: MockValidatorManager,
    validator: string
) {
    let type = await executor.getValidatorType(validator)
    let validatorSize  = await executor.validatorSize()
    let list
    let size = type == 1 ? validatorSize.sudoSize : validatorSize.normalSize
    list = await executor.getValidatorsPaginated(SENTINEL, size, type)
    let prevValidator = getPrevPlugin(validator, list)
    let data = executor.interface.encodeFunctionData('toggleValidatorType', [prevValidator, validator])
    return await execute({executor, data})
}

function isHooksManager(value: any): value is MockHooksManager {
    return typeof value === 'object' && value !== null && 'enableHooks' in value;
}

function isModuleManager(value: any): value is MockModuleManager {
    return typeof value === 'object' && value !== null && 'enableModule' in value;
}

function isValidatorManger(value: any): value is MockValidatorManager {
    return typeof value === 'object' && value !== null && 'enableValidator' in value;
}

function isVersaWallet(value: any): value is VersaWallet {
    return typeof value === 'object' && value !== null
        && 'sudoExecute' in value;
}

function getPrevPlugin(
    plugin: string,
    list: string[]
) {
    let prevPlugin = SENTINEL

    for (let i = 0; i < list.length; i++) {
        if (list[i].toUpperCase() == plugin.toUpperCase()) {
            if (i == 0) {
                prevPlugin = SENTINEL
            } else {
                prevPlugin = list[i - 1]
            }
            break
        }
    }

    return prevPlugin
}
