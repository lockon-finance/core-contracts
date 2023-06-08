import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployAndLog } from "../utils/deploys/deployAndLog";
import dependencies from "../utils/deploys/dependencies";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, getChainId, ethers } = hre;
  const { deployer, operator } = await getNamedAccounts();
  const chainId = process.env.FORK ? 1 : parseInt(await getChainId(), 10);
  const startBalance = await ethers.provider.getBalance((await ethers.getSigners())[0].address);

  console.log("\n======================================================");
  console.log("\n  Tag : Core");
  console.log(`  chainId : ${chainId} `);
  console.log(`  deployer : ${deployer}`);
  console.log("\n======================================================");

  console.log("\nCore");
  console.log("========");

  const deployedController = await deployAndLog("Controller", {
    from: deployer,
    args: [deployer],
    skipIfAlreadyDeployed: true,
  });

  const deployedSetTokenCreator = await deployAndLog("SetTokenCreator", {
    from: deployer,
    args: [deployedController.address],
    skipIfAlreadyDeployed: true,
  });

  const deployedIntegrationRegistry = await deployAndLog("IntegrationRegistry", {
    from: deployer,
    args: [deployedController.address],
    skipIfAlreadyDeployed: true,
  });

  console.log("\nModules");
  console.log("========");

  const deployedBasicIssuanceModule = await deployAndLog("BasicIssuanceModule", {
    from: deployer,
    args: [deployedController.address],
    skipIfAlreadyDeployed: true,
  });

  const deployedTradeModule = await deployAndLog("TradeModule", {
    from: deployer,
    args: [deployedController.address, operator],
    skipIfAlreadyDeployed: true,
  });

  await deployAndLog("ExchangeIssuanceZeroEx", {
    from: deployer,
    args: [dependencies.WETH[chainId], deployedController.address, dependencies.ZERO_EX_EXCHANGE[chainId]],
    skipIfAlreadyDeployed: true,
  });

  const controller = await ethers.getContractAt("Controller", deployedController.address);
  const isInitialized = await controller.isInitialized();
  if (!isInitialized) {
    const factories = [deployedSetTokenCreator.address];
    const modules = [deployedBasicIssuanceModule.address, deployedTradeModule.address];
    const resources = [deployedIntegrationRegistry.address];
    const resourceIds = [0];
    await controller.initialize(factories, modules, resources, resourceIds);
  }

  console.log("\nAdapters");
  console.log("========");

  const deployedUniswapV2ExchangeAdapterV2 = await deployAndLog("UniswapV2ExchangeAdapterV2", {
    from: deployer,
    args: [dependencies.UNISWAP_ROUTER[chainId]],
    skipIfAlreadyDeployed: true,
  });

  const deployedUniswapV3ExchangeAdapterV3 = await deployAndLog("UniswapV3ExchangeAdapterV2", {
    from: deployer,
    args: [dependencies.UNISWAP_ROUTER_V3[chainId]],
    skipIfAlreadyDeployed: true,
  });

  const integrationRegistry = await ethers.getContractAt(
    "IntegrationRegistry",
    deployedIntegrationRegistry.address,
  );
  await integrationRegistry.addIntegration(
    deployedTradeModule.address,
    "UNISWAPV2",
    deployedUniswapV2ExchangeAdapterV2.address,
  );
  await integrationRegistry.addIntegration(
    deployedTradeModule.address,
    "UNISWAPV3",
    deployedUniswapV3ExchangeAdapterV3.address,
  );

  const cost = startBalance.sub(
    await ethers.provider.getBalance((await ethers.getSigners())[0].address),
  );
  console.log("\n======================================================");
  console.log("\n  Deploy Complete!");
  console.log(`  cost : ${ethers.utils.formatEther(cost)} MATIC`);
  console.log("\n======================================================");
};

export default func;

func.tags = ["Core"];
