import { ethers } from "hardhat";

async function create2() {
    const Deployer = await ethers.getContractFactory("Deployer");
    const deployer = await Deployer.deploy();
    await deployer.deployed();
    console.log("deployer", deployer);

    await deployer.deploy1({ gasLimit: 10000000 });
}

async function create3() {
    const deployer = await ethers.getContractAt("Deployer", "0xd8e104699a041393e2990f83d207ebfec7922ed3");
    await deployer.deploy1({ gasLimit: 10000000 });
    await deployer.deploy2({ gasLimit: 10000000 });
}

create3();
