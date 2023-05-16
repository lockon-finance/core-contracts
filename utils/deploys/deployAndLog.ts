import hardhat from "hardhat";
import type { DeployOptions, DeployResult } from "hardhat-deploy/types";

const { deployments } = hardhat;
const { deploy } = deployments;

const displayResult = (name: string, result: DeployResult) => {
  if (!result.newlyDeployed) {
    console.log(`Re-used existing ${name} at ${result.address}`);
  } else {
    console.log(`${name} deployed at ${result.address}`);
  }
};

export const deployAndLog = async (name: string, options: DeployOptions) => {
  console.log(`\nDeploying ${name}...`);
  const result = await deploy(name, options);
  displayResult(name, result);
  return result;
};
