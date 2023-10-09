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
        const mockValidatorFactory_2 = await ethers.getContractFactory("MockValidator2");

        mockValidator_1 = await mockValidatorFactory.deploy();
        await mockValidator_1.deployed();

        mockValidator_2 = await mockValidatorFactory_2.deploy();
        await mockValidator_2.deployed();

        // Deploy ValidatorManager contract
        const validatorManagerFactory = await ethers.getContractFactory("MockValidatorManager");
        validatorManager = await validatorManagerFactory.deploy();
        await validatorManager.deployed();
    });

    it("should enable a validator", async () => {
        // Enable the validator
        let sudo = 1;
        let normal = 2;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: sudo,
        });

        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: normal,
        });

        // should not enable enabled valdiator
        await expect(
            enablePlugin({
                executor: validatorManager,
                plugin: mockValidator_1.address,
                type: sudo,
            })
        ).to.revertedWith("E309");

        // should not enable enabled valdiator
        await expect(
            enablePlugin({
                executor: validatorManager,
                plugin: mockValidator_1.address,
                type: normal,
            })
        ).to.revertedWith("E309");

        await expect(validatorManager.enableValidator("0x")).to.be.revertedWith("E101");

        await expect(
            enablePlugin({
                executor: validatorManager,
                plugin: owner.address,
                type: sudo,
            })
        ).to.be.reverted;

        await expect(
            enablePlugin({
                executor: validatorManager,
                plugin: mockValidator_2.address,
                type: 0,
            })
        ).to.be.revertedWith("E308");

        // Verify if the validator is enabled
        const validatorType = await validatorManager.getValidatorType(mockValidator_1.address);
        expect(validatorType).to.equal(sudo);
    });

    it("should disable a validator", async () => {
        // Enable the validator
        let sudo = 1;
        let normal = 2;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: sudo,
        });

        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: normal,
        });

        // Disable the normal validator
        await expect(disablePlugin(validatorManager, mockValidator_2.address))
            .to.emit(validatorManager, "DisabledValidatorWithError")
            .withArgs(mockValidator_2.address);

        let expectValidatorType = 0; // disabled
        let validatorType = await validatorManager.getValidatorType(mockValidator_2.address);
        expect(validatorType).to.equal(expectValidatorType);

        // enable the second sudo validator to remove the first
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: sudo,
        });

        await expect(disablePlugin(validatorManager, mockValidator_1.address))
            .to.emit(validatorManager, "DisabledValidator")
            .withArgs(mockValidator_1.address);

        await expect(validatorManager.disableValidator(SENTINEL, mockValidator_1.address)).to.be.revertedWith("E101");

        await expect(
            validatorManager.execute(
                validatorManager.address,
                0,
                validatorManager.interface.encodeFunctionData("disableValidator", [SENTINEL, mockValidator_1.address]),
                0
            )
        ).to.revertedWith("E310");

        // Verify if the validator is disabled
        validatorType = await validatorManager.getValidatorType(mockValidator_1.address);
        expect(validatorType).to.equal(expectValidatorType);
    });

    it("should toggle a validator's type", async () => {
        // Enable the validator as a sudo validator
        let sudo = 1;
        let normal = 2;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: sudo,
        });

        await expect(toggleValidator(validatorManager, mockValidator_1.address)).to.be.revertedWith("E311");

        await expect(validatorManager.toggleValidatorType(SENTINEL, mockValidator_1.address)).to.be.revertedWith(
            "E101"
        );

        // Enable the validator as a normal validator
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: sudo,
        });

        // Toggle the validator's type to normal
        await toggleValidator(validatorManager, mockValidator_2.address);

        // Verify if the validator's type is toggled to normal
        let validatorType = await validatorManager.getValidatorType(mockValidator_2.address);
        expect(validatorType).to.equal(normal);

        // toggle validator to sudo
        await toggleValidator(validatorManager, mockValidator_2.address);
        validatorType = await validatorManager.getValidatorType(mockValidator_2.address);
        expect(validatorType).to.equal(sudo);

        await expect(
            validatorManager.execute(
                validatorManager.address,
                0,
                validatorManager.interface.encodeFunctionData("toggleValidatorType", [SENTINEL, owner.address]),
                0
            )
        ).to.revertedWith("E310");
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
        let sudo = 1;
        let normal = 2;
        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_1.address,
            type: sudo,
        });

        // Get a list of validators
        let validators = await validatorManager.getValidatorsPaginated(SENTINEL, 1, sudo);

        // Verify if the validator is in the list
        expect(validators[0]).to.equal(mockValidator_1.address);

        await enablePlugin({
            executor: validatorManager,
            plugin: mockValidator_2.address,
            type: sudo,
        });

        await expect(validatorManager.getValidatorsPaginated(SENTINEL, 5, 0)).to.revertedWith("E306");

        validators = await validatorManager.getValidatorsPaginated(SENTINEL, 2, sudo);
        expect(validators[0]).to.equal(mockValidator_2.address);
        expect(validators[1]).to.equal(mockValidator_1.address);

        validators = await validatorManager.getValidatorsPaginated(SENTINEL, 1, normal);
        expect(validators[0]).to.equal(ethers.constants.AddressZero);

        let expectedSudoSize = 2;
        let expectedNormalSize = 0;

        let validatorSize = await validatorManager.validatorSize();
        expect(validatorSize.sudoSize).to.be.equal(expectedSudoSize);
        expect(validatorSize.normalSize).to.be.equal(expectedNormalSize);
    });
});
