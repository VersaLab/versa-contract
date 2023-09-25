import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    MockValidatorManager,
    MockValidator,
    CompatibilityFallbackHandler,
    CompatibilityFallbackHandler__factory,
    MockValidator__factory,
    MockValidator2__factory,
    ValidatorManager__factory,
    MockValidatorManager__factory,
} from "../../typechain-types";
import { formatBytes32String, parseBytes32String } from "ethers/lib/utils";
import { enablePlugin } from "../base/utils";
import { toUtf8Bytes, hexConcat, hexlify } from "ethers/lib/utils";

describe("CompatibilityFallbackHandler", () => {
    let validatorManager: any;
    let compatibilityFallbackHandler: CompatibilityFallbackHandler;
    let mockValidator_1: MockValidator;
    let mockValidator_2: MockValidator;
    let owner: SignerWithAddress;

    const EIP1271_MAGIC_VALUE = "0x1626ba7e";
    const INVALID = "0xffffffff";

    beforeEach(async () => {
        [owner] = await ethers.getSigners();
        compatibilityFallbackHandler = await new CompatibilityFallbackHandler__factory(owner).deploy();
        mockValidator_1 = await new MockValidator__factory(owner).deploy();
        mockValidator_2 = await new MockValidator2__factory(owner).deploy();
        validatorManager = await new MockValidatorManager__factory(owner).deploy();

        // enable validators
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: 1,
        });

        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: 1,
        });

        // set fallback handler
        validatorManager.updateFallbackHandler(compatibilityFallbackHandler.address);

        validatorManager = await ethers.getContractAt("CompatibilityFallbackHandler", validatorManager.address);
    });

    it("only sodu validator call be delegate to validate signature", async () => {
        let validator = ethers.constants.AddressZero;
        let hash = formatBytes32String("0x");
        let signature = validator.padEnd(128, "0");

        await expect(validatorManager.isValidSignature(hash, signature)).to.be.revertedWith("E200");
    });

    it("should return EIP1271 magic value if signature is valid", async () => {
        let hash = formatBytes32String("0x");
        let signature = hexlify(hexConcat([mockValidator_1.address, "0x00"]).slice(0, 64));

        let res = await validatorManager.isValidSignature(hash, signature);
        expect(res).to.be.equal(EIP1271_MAGIC_VALUE);
    });

    it("should return EIP1271 invalid value if signature is not valid", async () => {
        let hash = formatBytes32String("0x");
        let signature = hexlify(hexConcat([mockValidator_2.address, "0x00"]).slice(0, 64));
        let res = await validatorManager.isValidSignature(hash, signature);
        expect(res).to.be.equal(INVALID);
    });
});
