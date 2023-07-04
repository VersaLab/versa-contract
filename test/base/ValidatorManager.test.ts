import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockValidatorManager, MockValidator } from "../../typechain-types";
import { SENTINEL, disablePlugin, enablePlugin, toggleValidator } from "./utils";

describe("ValidatorManager", () => {
    let validatorManager: MockValidatorManager;
    let mockValidator_1: MockValidator;
    let mockValidator_2: MockValidator;
    let owner: SignerWithAddress;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();

        // Deploy MockValidator contract
        const mockValidatorFactory = await ethers.getContractFactory("MockValidator");
        mockValidator_1 = await mockValidatorFactory.deploy();
        await mockValidator_1.deployed();

        mockValidator_2 = await mockValidatorFactory.deploy();
        await mockValidator_2.deployed();

        // Deploy ValidatorManager contract
        const validatorManagerFactory = await ethers.getContractFactory("MockValidatorManager");
        validatorManager = await validatorManagerFactory.deploy();
        await validatorManager.deployed();
    });

    it("should enable a validator", async () => {
        // Enable the validator
        let expectedValidatorType = 2;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: expectedValidatorType,
        });

        // Verify if the validator is enabled
        const validatorType = await validatorManager.getValidatorType(mockValidator_1.address);
        expect(validatorType).to.equal(expectedValidatorType);
    });

    it("should disable a validator", async () => {
        // Enable the validator
        let expectedValidatorType = 2;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: expectedValidatorType,
        });

        // Disable the validator
        await disablePlugin(validatorManager, mockValidator_1.address);
        expectedValidatorType = 0; // disabled

        // Verify if the validator is disabled
        const validatorType = await validatorManager.getValidatorType(mockValidator_1.address);
        expect(validatorType).to.equal(expectedValidatorType);
    });

    it("should toggle a validator's type", async () => {
        // Enable the validator as a sudo validator
        let expectedValidatorType = 1;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: expectedValidatorType,
        });

        await expect(toggleValidator(validatorManager, mockValidator_1.address)).to.be.revertedWith(
            "Cannot remove the last remaining sudoValidator"
        );

        // Enable the validator as a normal validator
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: expectedValidatorType,
        });

        // Toggle the validator's type to normal
        await toggleValidator(validatorManager, mockValidator_2.address);

        expectedValidatorType = 2;

        // Verify if the validator's type is toggled to normal
        const validatorType = await validatorManager.getValidatorType(mockValidator_2.address);
        expect(validatorType).to.equal(expectedValidatorType);
    });

    it("should get the type of a validator", async () => {
        // Enable the validator as a sudo validator
        let expectedValidatorType = 1;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: expectedValidatorType,
        });

        // Get the type of the validator
        const validatorType = await validatorManager.getValidatorType(mockValidator_1.address);

        // Verify if the validator's type is correct
        expect(validatorType).to.equal(expectedValidatorType);
    });

    it("should check if a validator is enabled", async () => {
        // Enable the validator as a sudo validator
        let expectedValidatorType = 1;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: expectedValidatorType,
        });

        // Check if the validator is enabled
        const isEnabled = await validatorManager.isValidatorEnabled(mockValidator_1.address);

        // Verify if the validator is enabled
        expect(isEnabled).to.be.true;
    });

    it("should get a list of validators", async () => {
        // Enable the validator
        let expectedValidatorType = 1;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: expectedValidatorType,
        });

        // Get a list of validators
        let validators = await validatorManager.getValidatorsPaginated(SENTINEL, 1, expectedValidatorType);

        // Verify if the validator is in the list
        expect(validators[0]).to.equal(mockValidator_1.address);

        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: expectedValidatorType,
        });

        validators = await validatorManager.getValidatorsPaginated(SENTINEL, 2, expectedValidatorType);
        expect(validators[0]).to.equal(mockValidator_2.address);
        expect(validators[1]).to.equal(mockValidator_1.address);

        let expectedSudoSize = 2;
        let expectedNormalSize = 0;

        let validatorSize = await validatorManager.validatorSize();
        expect(validatorSize.sudoSize).to.be.equal(expectedSudoSize);
        expect(validatorSize.normalSize).to.be.equal(expectedNormalSize);
    });
});
