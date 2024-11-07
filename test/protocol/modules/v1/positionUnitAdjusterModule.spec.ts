import "module-alias/register";

import { BigNumber, ContractTransaction } from "ethers";
import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { ADDRESS_ZERO, ZERO } from "@utils/constants";
import { PositionUnitAdjusterModule, SetToken } from "@utils/contracts";
import DeployHelper from "@utils/deploys";
import { ether, usdc } from "@utils/index";
import {
  addSnapshotBeforeRestoreAfterEach,
  getAccounts,
  getWaffleExpect,
  getSystemFixture,
} from "@utils/test/index";
import { SystemFixture } from "@utils/fixtures";
import { wbtc } from "@utils/common/unitsUtils";

const expect = getWaffleExpect();

/**
 * @title PositionUnitAdjusterModule Test
 * @dev This test suite tests the functionality of the PositionUnitAdjusterModule.
 */
describe("PositionUnitAdjusterModule [ @forked-mainnet ]", () => {
  let owner: Account;
  let manager: Account;
  let operator: Account;
  let deployer: DeployHelper;
  let setup: SystemFixture;

  let positionUnitAdjusterModule: PositionUnitAdjusterModule;
  let setToken: SetToken;

  before(async () => {
    [owner, manager, operator] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);
    setup = getSystemFixture(owner.address);
    await setup.initialize();

    positionUnitAdjusterModule = await deployer.modules.deployPositionUnitAdjusterModule(
      setup.controller.address,
      operator.address,
    );
    await setup.controller.addModule(positionUnitAdjusterModule.address);

    setToken = await setup.createSetToken(
      [setup.weth.address, setup.usdc.address],
      [ether(1), usdc(2)],
      [setup.issuanceModule.address, positionUnitAdjusterModule.address],
      manager.address,
    );

    await positionUnitAdjusterModule.connect(manager.wallet).initialize(setToken.address);
    const mockPreIssuanceHook = await deployer.mocks.deployManagerIssuanceHookMock();
    await setup.issuanceModule
      .connect(manager.wallet)
      .initialize(setToken.address, mockPreIssuanceHook.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set the correct controller", async () => {
      const controller = await positionUnitAdjusterModule.controller();
      expect(controller).to.eq(setup.controller.address);
    });

    it("should set the correct operator", async () => {
      const isOperator = await positionUnitAdjusterModule.isOperator(operator.address);
      expect(isOperator).to.be.true;
    });
  });

  describe("#initialize", async () => {
    let newSetToken: SetToken;

    beforeEach(async () => {
      newSetToken = await setup.createSetToken(
        [setup.weth.address],
        [ether(1)],
        [setup.issuanceModule.address, positionUnitAdjusterModule.address],
        manager.address,
      );
    });

    async function subject(): Promise<any> {
      return positionUnitAdjusterModule.connect(manager.wallet).initialize(newSetToken.address);
    }

    it("should enable the Module on the SetToken", async () => {
      await subject();
      const isModuleEnabled = await newSetToken.isInitializedModule(
        positionUnitAdjusterModule.address,
      );
      expect(isModuleEnabled).to.eq(true);
    });

    it("should revert when the caller is not the SetToken manager", async () => {
      await expect(
        positionUnitAdjusterModule.connect(owner.wallet).initialize(newSetToken.address),
      ).to.be.revertedWith("Must be the SetToken manager");
    });

    it("should revert when the module is not pending", async () => {
      await subject();
      await expect(subject()).to.be.revertedWith("Must be pending initialization");
    });

    it("should revert when the SetToken is not enabled on the controller", async () => {
      const nonEnabledSetToken = await setup.createNonControllerEnabledSetToken(
        [setup.weth.address],
        [ether(1)],
        [positionUnitAdjusterModule.address],
        manager.address,
      );

      await expect(
        positionUnitAdjusterModule.connect(manager.wallet).initialize(nonEnabledSetToken.address),
      ).to.be.revertedWith("Must be controller-enabled SetToken");
    });
  });

  describe("#calculateDefaultPositionUnits", async () => {
    let subjectIssueQuantity: BigNumber;
    let subjectSetToken: Address;
    let subjectComponents: Address[];

    beforeEach(async () => {
      subjectSetToken = setToken.address;
      subjectComponents = [setup.weth.address];

      await setup.weth.transfer(setToken.address, ether(2));
      await setup.usdc.transfer(setToken.address, usdc(2));
    });

    async function subject(): Promise<any> {
      return positionUnitAdjusterModule.calculateDefaultPositionUnits(
        subjectSetToken,
        subjectComponents,
      );
    }

    context("when total supply is 0", () => {
      beforeEach(async () => {
        subjectIssueQuantity = ZERO;
      });
      context("When components is empty", () => {
        beforeEach(async () => {
          subjectComponents = [];
        });

        it("should return 0 total supply and empty component data", async () => {
          const [totalSupply, componentData] = await subject();
          expect(totalSupply).to.eq(ZERO);
          expect(componentData.length).to.eq(0);
        });
      });
      context("When the components array contains a single element", () => {
        beforeEach(async () => {
          subjectComponents = [setup.weth.address];
        });
        it("should return the correct total supply and component data", async () => {
          const [totalSupply, componentData] = await subject();

          expect(totalSupply).to.eq(ZERO);
          expect(componentData.length).to.eq(1);
          expect(componentData[0].component).to.eq(setup.weth.address);
          expect(componentData[0].balance).to.eq(ether(2));
          expect(componentData[0].currentRealUnit).to.eq(ether(1));
          expect(componentData[0].calculatedRealUnit).to.eq(ether(1));
        });
      });
      context("When components array contains multiple elements", () => {
        beforeEach(async () => {
          subjectComponents = [setup.weth.address, setup.usdc.address, setup.wbtc.address];
        });
        it("should return the correct total supply and component data", async () => {
          const [totalSupply, componentData] = await subject();

          expect(totalSupply).to.eq(ZERO);
          expect(componentData.length).to.eq(3);
          expect(componentData[0].component).to.eq(setup.weth.address);
          expect(componentData[0].balance).to.eq(ether(2));
          expect(componentData[0].currentRealUnit).to.eq(ether(1));
          expect(componentData[0].calculatedRealUnit).to.eq(ether(1));
          expect(componentData[1].component).to.eq(setup.usdc.address);
          expect(componentData[1].balance).to.eq(usdc(2));
          expect(componentData[1].currentRealUnit).to.eq(usdc(2));
          expect(componentData[1].calculatedRealUnit).to.eq(usdc(2));
          expect(componentData[2].component).to.eq(setup.wbtc.address);
          expect(componentData[2].balance).to.eq(ZERO);
          expect(componentData[2].currentRealUnit).to.eq(ZERO);
          expect(componentData[2].calculatedRealUnit).to.eq(ZERO);
        });
      });
    });

    context("when total supply greater than 0", () => {
      beforeEach(async () => {
        // Issue 10 SetTokens
        subjectIssueQuantity = ether(10);
        await setup.issuanceModule.issue(setToken.address, subjectIssueQuantity, owner.address);
      });

      context("When components is empty", () => {
        beforeEach(async () => {
          subjectComponents = [];
        });

        it("should return the correct total supply and component data", async () => {
          const [totalSupply, componentData] = await subject();
          expect(totalSupply).to.eq(subjectIssueQuantity);
          expect(componentData.length).to.eq(0);
        });
      });

      context("When the components array contains a single element", () => {
        beforeEach(async () => {
          subjectComponents = [setup.weth.address];
        });
        it("should return the correct total supply and component data", async () => {
          const [totalSupply, componentData] = await subject();

          expect(totalSupply).to.eq(subjectIssueQuantity);
          expect(componentData.length).to.eq(1);
          expect(componentData[0].balance).to.eq(ether(12));
          expect(componentData[0].currentRealUnit).to.eq(ether(1));
          expect(componentData[0].calculatedRealUnit).to.eq(ether(1.2));
        });
        it("should revert when component is zero address", async () => {
          subjectComponents = [ADDRESS_ZERO];
          await expect(subject()).to.be.revertedWith("Invalid component");
        });
      });
      context("When components array contains multiple elements", () => {
        beforeEach(async () => {
          subjectComponents = [setup.weth.address, setup.usdc.address, setup.wbtc.address];
        });
        it("should return the correct total supply and component data", async () => {
          const [totalSupply, componentData] = await subject();

          expect(totalSupply).to.eq(subjectIssueQuantity);
          expect(componentData.length).to.eq(3);
          expect(componentData[0].balance).to.eq(ether(12));
          expect(componentData[0].currentRealUnit).to.eq(ether(1));
          expect(componentData[0].calculatedRealUnit).to.eq(ether(1.2));
          expect(componentData[1].balance).to.eq(usdc(22));
          expect(componentData[1].currentRealUnit).to.eq(usdc(2));
          expect(componentData[1].calculatedRealUnit).to.eq(usdc(2.2));
          expect(componentData[2].balance).to.eq(ZERO);
          expect(componentData[2].currentRealUnit).to.eq(ZERO);
          expect(componentData[2].calculatedRealUnit).to.eq(ZERO);
        });
      });
    });
  });

  describe("#adjustDefaultPositionUnits", async () => {
    let subjectIssueQuantity: BigNumber = ZERO;
    let subjectTransferWethQuantity: BigNumber = ZERO;
    let subjectTransferUsdcQuantity: BigNumber = ZERO;
    let subjectTransferWbtcQuantity: BigNumber = ZERO;
    let subjectCaller: Account;
    let subjectSetToken: Address;
    let subjectComponents: Address[];
    let subjectRequestedUnits: BigNumber[];

    beforeEach(async () => {
      subjectSetToken = setToken.address;
      subjectComponents = [setup.weth.address, setup.usdc.address];
      subjectRequestedUnits = [ZERO, ZERO];
    });

    async function subject(): Promise<ContractTransaction> {
      if (subjectIssueQuantity.gt(ZERO)) {
        await setup.issuanceModule.issue(setToken.address, subjectIssueQuantity, owner.address);
      }
      if (subjectTransferWethQuantity.gt(ZERO)) {
        await setup.weth.transfer(setToken.address, subjectTransferWethQuantity);
      }
      if (subjectTransferUsdcQuantity.gt(ZERO)) {
        await setup.usdc.transfer(setToken.address, subjectTransferUsdcQuantity);
      }
      if (subjectTransferWbtcQuantity.gt(ZERO)) {
        await setup.wbtc.transfer(setToken.address, subjectTransferWbtcQuantity);
      }

      return positionUnitAdjusterModule
        .connect(subjectCaller.wallet)
        .adjustDefaultPositionUnits(subjectSetToken, subjectComponents, subjectRequestedUnits);
    }

    context("when total supply is 0", () => {
      beforeEach(async () => {
        subjectIssueQuantity = ZERO;
      });

      context("when caller is not manager or operator", () => {
        beforeEach(async () => {
          subjectCaller = owner;
        });
        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("OnlyManagerOrOperator");
        });
      });

      context("when caller is manager or operator", () => {
        beforeEach(async () => {
          subjectCaller = manager;
        });

        it("should revert when no components are provided", async () => {
          subjectComponents = [];
          subjectRequestedUnits = [];
          await expect(subject()).to.be.revertedWith("No components provided");
        });

        it("should revert when components and requested units arrays length mismatch", async () => {
          subjectComponents = [setup.weth.address];
          await expect(subject()).to.be.revertedWith("Invalid requested units length");
        });

        it("should revert when total supply is 0", async () => {
          await expect(subject()).to.be.revertedWith("Total supply is 0");
        });
      });
    });

    context("when total supply is greater than 0", () => {
      beforeEach(async () => {
        // Issue 10 SetTokens, WETH 10, USDC 20
        subjectIssueQuantity = ether(10);

        // Add 20 WETH and 40 USDC to the SetToken, WETH 30, USDC 60
        subjectTransferWethQuantity = ether(20);
        subjectTransferUsdcQuantity = usdc(40);
      });

      context("when caller is not manager or operator", () => {
        beforeEach(async () => {
          subjectCaller = owner;
        });
        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("OnlyManagerOrOperator");
        });
      });

      context("when caller is manager", () => {
        beforeEach(async () => {
          subjectCaller = manager;
        });

        it("should revert when no components are provided", async () => {
          subjectComponents = [];
          subjectRequestedUnits = [];
          await expect(subject()).to.be.revertedWith("No components provided");
        });

        it("should revert when components and requested units arrays length mismatch", async () => {
          subjectComponents = [setup.weth.address];
          await expect(subject()).to.be.revertedWith("Invalid requested units length");
        });

        it("should adjust position units correctly", async () => {
          subjectComponents = [setup.weth.address, setup.usdc.address];
          subjectRequestedUnits = [ether(3), usdc(4)];

          const beforeComponents = await setToken.getComponents();
          const beforeWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const beforeUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          const beforeTotalSupply = await setToken.totalSupply();
          const beforeWethBalance = await setup.weth.balanceOf(setToken.address);
          const beforeUsdcBalance = await setup.usdc.balanceOf(setToken.address);
          expect(beforeComponents.length).to.eq(2);
          expect(beforeWethPositionUnit).to.eq(ether(1));
          expect(beforeUsdcPositionUnit).to.eq(usdc(2));
          expect(beforeTotalSupply).to.eq(ether(0));
          expect(beforeWethBalance).to.eq(ether(0));
          expect(beforeUsdcBalance).to.eq(usdc(0));

          await subject();

          const afterComponents = await setToken.getComponents();
          const afterWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const afterUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          const afterTotalSupply = await setToken.totalSupply();
          const afterWethBalance = await setup.weth.balanceOf(setToken.address);
          const afterUsdcBalance = await setup.usdc.balanceOf(setToken.address);
          expect(afterComponents.length).to.eq(2);
          expect(afterWethPositionUnit).to.eq(ether(3));
          expect(afterUsdcPositionUnit).to.eq(usdc(4));
          expect(afterTotalSupply).to.eq(ether(10));
          expect(afterWethBalance).to.eq(ether(30));
          expect(afterUsdcBalance).to.eq(usdc(60));
        });
      });

      context("when caller is operator", () => {
        beforeEach(async () => {
          subjectCaller = operator;
        });

        it("should revert when no components are provided", async () => {
          subjectComponents = [];
          subjectRequestedUnits = [];
          await expect(subject()).to.be.revertedWith("No components provided");
        });

        it("should revert when components and requested units arrays length mismatch", async () => {
          subjectComponents = [setup.weth.address];
          await expect(subject()).to.be.revertedWith("Invalid requested units length");
        });

        it("should adjust position units correctly", async () => {
          subjectTransferWbtcQuantity = wbtc(20);
          subjectComponents = [setup.weth.address, setup.usdc.address, setup.wbtc.address];
          subjectRequestedUnits = [ether(3), usdc(4), wbtc(1)];

          const beforeComponents = await setToken.getComponents();
          const beforeWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const beforeUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          const beforeWbtcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.wbtc.address,
          );
          const beforeTotalSupply = await setToken.totalSupply();
          const beforeWethBalance = await setup.weth.balanceOf(setToken.address);
          const beforeUsdcBalance = await setup.usdc.balanceOf(setToken.address);
          const beforeWbtcBalance = await setup.wbtc.balanceOf(setToken.address);
          expect(beforeComponents.length).to.eq(2);
          expect(beforeWethPositionUnit).to.eq(ether(1));
          expect(beforeUsdcPositionUnit).to.eq(usdc(2));
          expect(beforeWbtcPositionUnit).to.eq(ZERO);
          expect(beforeTotalSupply).to.eq(ether(0));
          expect(beforeWethBalance).to.eq(ether(0));
          expect(beforeUsdcBalance).to.eq(usdc(0));
          expect(beforeWbtcBalance).to.eq(ZERO);
          await subject();

          const afterComponents = await setToken.getComponents();
          const afterWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const afterUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          const afterWbtcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.wbtc.address,
          );
          const afterTotalSupply = await setToken.totalSupply();
          const afterWethBalance = await setup.weth.balanceOf(setToken.address);
          const afterUsdcBalance = await setup.usdc.balanceOf(setToken.address);
          const afterWbtcBalance = await setup.wbtc.balanceOf(setToken.address);
          expect(afterComponents.length).to.eq(3);
          expect(afterWethPositionUnit).to.eq(ether(3));
          expect(afterUsdcPositionUnit).to.eq(usdc(4));
          expect(afterWbtcPositionUnit).to.eq(wbtc(1));
          expect(afterTotalSupply).to.eq(ether(10));
          expect(afterWethBalance).to.eq(ether(30));
          expect(afterUsdcBalance).to.eq(usdc(60));
          expect(afterWbtcBalance).to.eq(wbtc(20));
        });

        it("should emit DefaultPositionUnitAdjusted events correctly", async () => {
          subjectComponents = [setup.weth.address, setup.usdc.address];
          subjectRequestedUnits = [ether(3), usdc(4)];

          await expect(subject())
            .to.emit(positionUnitAdjusterModule, "DefaultPositionUnitAdjusted")
            .withArgs(setToken.address, setup.weth.address, ether(30), ether(1), ether(3))
            .and.to.emit(positionUnitAdjusterModule, "DefaultPositionUnitAdjusted")
            .withArgs(setToken.address, setup.usdc.address, usdc(60), usdc(2), usdc(4));
        });

        it("should revert when requested unit is less than or equal to current unit", async () => {
          subjectRequestedUnits = [ether(1), usdc(2)];
          await expect(subject()).to.be.revertedWith(
            "Requested unit is less than or equal to current unit",
          );
        });

        it("should revert when requested unit is greater than calculated unit", async () => {
          subjectRequestedUnits = [ether("3.000000000000000001"), usdc(6.000001)];
          await expect(subject()).to.be.revertedWith(
            "Requested unit is greater than calculated unit",
          );
        });

        it("should revert when component is zero address", async () => {
          subjectComponents = [ADDRESS_ZERO];
          subjectRequestedUnits = [ZERO];

          await expect(subject()).to.be.revertedWith("Invalid component");
        });

        it("should use calculated unit when requested unit is 0", async () => {
          subjectRequestedUnits = [ZERO, ZERO];
          await subject();

          const afterWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const afterUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          expect(afterWethPositionUnit).to.eq(ether(3)); // 30 WETH / 10 total supply
          expect(afterUsdcPositionUnit).to.eq(usdc(6)); // 60 USDC / 10 total supply
        });

        it("should skip adjustment when current unit equals calculated unit", async () => {
          subjectTransferWethQuantity = ZERO;
          subjectComponents = [setup.weth.address];
          subjectRequestedUnits = [ether(1)];

          await expect(subject()).to.not.emit(
            positionUnitAdjusterModule,
            "DefaultPositionUnitAdjusted",
          );
        });

        it("should adjust correctly for a single component", async () => {
          subjectComponents = [setup.weth.address];
          subjectRequestedUnits = [ether(3)];

          const beforeWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const beforeUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          expect(beforeWethPositionUnit).to.eq(ether(1));
          expect(beforeUsdcPositionUnit).to.eq(usdc(2));

          await subject();

          const afterWethPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.weth.address,
          );
          const afterUsdcPositionUnit = await setToken.getDefaultPositionRealUnit(
            setup.usdc.address,
          );
          expect(afterWethPositionUnit).to.eq(ether(3));
          expect(afterUsdcPositionUnit).to.eq(usdc(2));
        });

        it("should process the last value when duplicate components are provided", async () => {
          subjectComponents = [setup.weth.address, setup.weth.address];
          subjectRequestedUnits = [ether(3), ether(2)];

          await subject();

          const postWethUnit = await setToken.getDefaultPositionRealUnit(setup.weth.address);

          expect(postWethUnit).to.eq(ether(2));
        });

        it("should revert when requested unit is less than 0", async () => {
          subjectComponents = [setup.weth.address];
          subjectRequestedUnits = [ether(-1)];
          await expect(subject()).to.be.revertedWith("Requested unit is less than 0");
        });
      });
    });
  });

  describe("#removeModule", async () => {
    async function subject(): Promise<any> {
      setToken = setToken.connect(manager.wallet);
      return setToken.removeModule(positionUnitAdjusterModule.address);
    }

    it("should remove the module", async () => {
      await subject();
      const isModuleEnabled = await setToken.isInitializedModule(
        positionUnitAdjusterModule.address,
      );
      expect(isModuleEnabled).to.eq(false);
    });
  });
});
