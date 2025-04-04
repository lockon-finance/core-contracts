import "module-alias/register";
import { BigNumber } from "ethers";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { ADDRESS_ZERO, ZERO, ONE, PRECISE_UNIT } from "@utils/constants";
import { BasicIssuanceModule, ManagerIssuanceHookMock, SetToken } from "@utils/contracts";
import DeployHelper from "@utils/deploys";
import { bitcoin, ether } from "@utils/index";
import {
  addSnapshotBeforeRestoreAfterEach,
  getAccounts,
  getRandomAccount,
  getRandomAddress,
  getWaffleExpect,
  getSystemFixture,
} from "@utils/test/index";
import { SystemFixture } from "@utils/fixtures";

const expect = getWaffleExpect();

describe("BasicIssuanceModule [ @forked-mainnet ]", () => {
  let owner: Account;
  let recipient: Account;
  let deployer: DeployHelper;
  let setup: SystemFixture;

  let issuanceModule: BasicIssuanceModule;

  before(async () => {
    [owner, recipient] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);
    setup = getSystemFixture(owner.address);
    await setup.initialize();

    issuanceModule = await deployer.modules.deployBasicIssuanceModule(setup.controller.address);
    await setup.controller.addModule(issuanceModule.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#initialize", async () => {
    let setToken: SetToken;
    let subjectSetToken: Address;
    let subjectPreIssuanceHook: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      setToken = await setup.createSetToken(
        [setup.weth.address],
        [ether(1)],
        [issuanceModule.address],
      );
      subjectSetToken = setToken.address;
      subjectPreIssuanceHook = await getRandomAddress();
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return issuanceModule
        .connect(subjectCaller.wallet)
        .initialize(subjectSetToken, subjectPreIssuanceHook);
    }

    it("should enable the Module on the SetToken", async () => {
      await subject();
      const isModuleEnabled = await setToken.isInitializedModule(issuanceModule.address);
      expect(isModuleEnabled).to.eq(true);
    });

    it("should properly set the issuance hooks", async () => {
      await subject();
      const preIssuanceHooks = await issuanceModule.managerIssuanceHook(subjectSetToken);
      expect(preIssuanceHooks).to.eq(subjectPreIssuanceHook);
    });

    describe("when the caller is not the SetToken manager", async () => {
      beforeEach(async () => {
        subjectCaller = await getRandomAccount();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Must be the SetToken manager");
      });
    });

    describe("when SetToken is not in pending state", async () => {
      beforeEach(async () => {
        const newModule = await getRandomAddress();
        await setup.controller.addModule(newModule);

        const issuanceModuleNotPendingSetToken = await setup.createSetToken(
          [setup.weth.address],
          [ether(1)],
          [newModule],
        );

        subjectSetToken = issuanceModuleNotPendingSetToken.address;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Must be pending initialization");
      });
    });

    describe("when the SetToken is not enabled on the controller", async () => {
      beforeEach(async () => {
        const nonEnabledSetToken = await setup.createNonControllerEnabledSetToken(
          [setup.weth.address],
          [ether(1)],
          [issuanceModule.address],
        );

        subjectSetToken = nonEnabledSetToken.address;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Must be controller-enabled SetToken");
      });
    });
  });

  describe("#removeModule", async () => {
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return issuanceModule.connect(subjectCaller.wallet).removeModule();
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith(
        "The BasicIssuanceModule module cannot be removed",
      );
    });
  });

  describe("#issue", async () => {
    let setToken: SetToken;

    let subjectSetToken: Address;
    let subjectIssueQuantity: BigNumber;
    let subjectTo: Account;
    let subjectCaller: Account;

    let preIssueHook: Address;

    context("when the components are WBTC and WETH", async () => {
      beforeEach(async () => {
        setToken = await setup.createSetToken(
          [setup.weth.address, setup.wbtc.address],
          [ether(1), bitcoin(2)],
          [issuanceModule.address],
        );
        await issuanceModule.initialize(setToken.address, preIssueHook);

        // Approve tokens to the issuance mdoule
        await setup.weth.approve(issuanceModule.address, ether(5));
        await setup.wbtc.approve(issuanceModule.address, bitcoin(10));

        subjectSetToken = setToken.address;
        subjectIssueQuantity = ether(2);
        subjectTo = recipient;
        subjectCaller = owner;
      });

      context("when there are no hooks", async () => {
        before(async () => {
          preIssueHook = ADDRESS_ZERO;
        });

        async function subject(): Promise<any> {
          return issuanceModule
            .connect(subjectCaller.wallet)
            .issue(subjectSetToken, subjectIssueQuantity, subjectTo.address);
        }

        context("when not paused", async () => {
          it("should issue the Set to the recipient", async () => {
            await subject();
            const issuedBalance = await setToken.balanceOf(recipient.address);
            expect(issuedBalance).to.eq(subjectIssueQuantity);
          });

          it("should have deposited the components into the SetToken", async () => {
            await subject();
            const depositedWETHBalance = await setup.weth.balanceOf(setToken.address);
            const expectedBTCBalance = subjectIssueQuantity;
            expect(depositedWETHBalance).to.eq(expectedBTCBalance);

            const depositedBTCBalance = await setup.wbtc.balanceOf(setToken.address);
            const expectedBalance = subjectIssueQuantity.mul(bitcoin(2)).div(ether(1));
            expect(depositedBTCBalance).to.eq(expectedBalance);
          });

          it("should emit the SetTokenIssued event", async () => {
            await expect(subject())
              .to.emit(issuanceModule, "SetTokenIssued")
              .withArgs(
                subjectSetToken,
                subjectCaller.address,
                subjectTo.address,
                ADDRESS_ZERO,
                subjectIssueQuantity,
              );
          });

          describe("when the issue quantity is extremely small", async () => {
            beforeEach(async () => {
              subjectIssueQuantity = ONE;
            });

            it("should transfer the minimal units of components to the SetToken", async () => {
              await subject();
              const depositedWETHBalance = await setup.weth.balanceOf(setToken.address);
              const expectedWETHBalance = ONE;
              expect(depositedWETHBalance).to.eq(expectedWETHBalance);

              const depositedBTCBalance = await setup.wbtc.balanceOf(setToken.address);
              const expectedBTCBalance = ONE;
              expect(depositedBTCBalance).to.eq(expectedBTCBalance);
            });
          });

          describe("when a SetToken position is not in default state", async () => {
            beforeEach(async () => {
              // Add self as module and update the position state
              await setup.controller.addModule(owner.address);
              await setToken.addModule(owner.address);
              await setToken.initializeModule();

              const retrievedPosition = (await setToken.getPositions())[0];

              await setToken.addExternalPositionModule(
                retrievedPosition.component,
                retrievedPosition.module,
              );
              await setToken.editExternalPositionUnit(
                retrievedPosition.component,
                retrievedPosition.module,
                retrievedPosition.unit,
              );
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Only default positions are supported");
            });
          });

          describe("when one of the components has a recipient-related fee", async () => {
            beforeEach(async () => {
              // Add self as module and update the position state
              await setup.controller.addModule(owner.address);
              await setToken.addModule(owner.address);
              await setToken.initializeModule();

              const tokenWithFee = await deployer.mocks.deployTokenWithFeeMock(
                owner.address,
                ether(20),
                ether(0.1),
              );
              await tokenWithFee.approve(issuanceModule.address, ether(100));

              const retrievedPosition = (await setToken.getPositions())[0];

              await setToken.addComponent(tokenWithFee.address);
              await setToken.editDefaultPositionUnit(tokenWithFee.address, retrievedPosition.unit);
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Invalid post transfer balance");
            });
          });

          describe("when the issue quantity is 0", async () => {
            beforeEach(async () => {
              subjectIssueQuantity = ZERO;
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith("Issue quantity must be > 0");
            });
          });

          describe("when the SetToken is not enabled on the controller", async () => {
            beforeEach(async () => {
              const nonEnabledSetToken = await setup.createNonControllerEnabledSetToken(
                [setup.weth.address],
                [ether(1)],
                [issuanceModule.address],
              );

              subjectSetToken = nonEnabledSetToken.address;
            });

            it("should revert", async () => {
              await expect(subject()).to.be.revertedWith(
                "Must be a valid and initialized SetToken",
              );
            });
          });
        });

        context("when paused", async () => {
          it("should revert", async () => {
            await issuanceModule.connect(subjectCaller.wallet).pause();
            await expect(subject()).to.be.revertedWith("Pausable: paused");
          });
        });

        context("When paused once and unpaused", async () => {
          it("should issue the Set to the recipient", async () => {
            await issuanceModule.connect(subjectCaller.wallet).pause();
            await issuanceModule.connect(subjectCaller.wallet).unpause();
            await subject();
            const issuedBalance = await setToken.balanceOf(recipient.address);
            expect(issuedBalance).to.eq(subjectIssueQuantity);
          });
        });
      });

      context("when a preIssueHook has been set", async () => {
        let issuanceHookContract: ManagerIssuanceHookMock;

        before(async () => {
          issuanceHookContract = await deployer.mocks.deployManagerIssuanceHookMock();

          preIssueHook = issuanceHookContract.address;
        });

        async function subject(): Promise<any> {
          return issuanceModule.issue(subjectSetToken, subjectIssueQuantity, subjectTo.address);
        }

        context("when not paused", async () => {
          it("should properly call the pre-issue hooks", async () => {
            await subject();
            const retrievedSetToken = await issuanceHookContract.retrievedSetToken();
            const retrievedIssueQuantity = await issuanceHookContract.retrievedIssueQuantity();
            const retrievedSender = await issuanceHookContract.retrievedSender();
            const retrievedTo = await issuanceHookContract.retrievedTo();

            expect(retrievedSetToken).to.eq(subjectSetToken);
            expect(retrievedIssueQuantity).to.eq(subjectIssueQuantity);
            expect(retrievedSender).to.eq(owner.address);
            expect(retrievedTo).to.eq(subjectTo.address);
          });

          it("should emit the SetTokenIssued event", async () => {
            await expect(subject())
              .to.emit(issuanceModule, "SetTokenIssued")
              .withArgs(
                subjectSetToken,
                subjectCaller.address,
                subjectTo.address,
                issuanceHookContract.address,
                subjectIssueQuantity,
              );
          });
        });

        context("when paused", async () => {
          it("should revert", async () => {
            await issuanceModule.connect(subjectCaller.wallet).pause();
            await expect(subject()).to.be.revertedWith("Pausable: paused");
          });
        });

        context("When paused once and unpaused", async () => {
          it("should properly call the pre-issue hooks", async () => {
            await issuanceModule.connect(subjectCaller.wallet).pause();
            await issuanceModule.connect(subjectCaller.wallet).unpause();
            await subject();
            const retrievedSetToken = await issuanceHookContract.retrievedSetToken();
            const retrievedIssueQuantity = await issuanceHookContract.retrievedIssueQuantity();
            const retrievedSender = await issuanceHookContract.retrievedSender();
            const retrievedTo = await issuanceHookContract.retrievedTo();

            expect(retrievedSetToken).to.eq(subjectSetToken);
            expect(retrievedIssueQuantity).to.eq(subjectIssueQuantity);
            expect(retrievedSender).to.eq(owner.address);
            expect(retrievedTo).to.eq(subjectTo.address);
          });
        });
      });
    });
  });

  describe("#redeem", async () => {
    let setToken: SetToken;

    let subjectSetToken: Address;
    let subjectRedeemQuantity: BigNumber;
    let subjectTo: Address;
    let subjectCaller: Account;

    let preIssueHook: Address;
    let feePercentage: BigNumber;

    context("when the components are WBTC and WETH", async () => {
      beforeEach(async () => {
        preIssueHook = ADDRESS_ZERO;

        setToken = await setup.createSetToken(
          [setup.weth.address, setup.wbtc.address],
          [ether(1), bitcoin(2)],
          [issuanceModule.address],
        );
        await issuanceModule.initialize(setToken.address, preIssueHook);

        // Approve tokens to the issuance module
        await setup.weth.approve(issuanceModule.address, ether(5));
        await setup.wbtc.approve(issuanceModule.address, bitcoin(10));

        subjectSetToken = setToken.address;
        subjectRedeemQuantity = ether(1);
        subjectTo = recipient.address;
        subjectCaller = owner;

        const issueQuantity = ether(2);
        await issuanceModule.issue(subjectSetToken, issueQuantity, subjectCaller.address);
      });

      async function subject(): Promise<any> {
        return issuanceModule
          .connect(subjectCaller.wallet)
          .redeem(subjectSetToken, subjectRedeemQuantity, subjectTo);
      }

      it("should redeem the Set", async () => {
        await subject();
        const redeemBalance = await setToken.balanceOf(owner.address);
        expect(redeemBalance).to.eq(ether(1));
      });

      it("should have deposited the components to the recipients account", async () => {
        const beforeWETHBalance = await setup.weth.balanceOf(recipient.address);
        const beforeBTCBalance = await setup.wbtc.balanceOf(recipient.address);

        await subject();
        const afterWETHBalance = await setup.weth.balanceOf(recipient.address);
        const expectedBTCBalance = beforeWETHBalance.add(subjectRedeemQuantity);
        expect(afterWETHBalance).to.eq(expectedBTCBalance);

        const afterBTCBalance = await setup.wbtc.balanceOf(recipient.address);
        const expectedBalance = beforeBTCBalance.add(
          subjectRedeemQuantity.mul(bitcoin(2)).div(ether(1)),
        );
        expect(afterBTCBalance).to.eq(expectedBalance);
      });

      it("should have subtracted from the components from the SetToken", async () => {
        const beforeWETHBalance = await setup.weth.balanceOf(setToken.address);
        const beforeBTCBalance = await setup.wbtc.balanceOf(setToken.address);

        await subject();
        const afterWETHBalance = await setup.weth.balanceOf(setToken.address);
        const expectedBTCBalance = beforeWETHBalance.sub(subjectRedeemQuantity);
        expect(afterWETHBalance).to.eq(expectedBTCBalance);

        const afterBTCBalance = await setup.wbtc.balanceOf(setToken.address);
        const expectedBalance = beforeBTCBalance.sub(
          subjectRedeemQuantity.mul(bitcoin(2)).div(ether(1)),
        );
        expect(afterBTCBalance).to.eq(expectedBalance);
      });

      it("should emit the SetTokenRedeemed event", async () => {
        const components = await setToken.getComponents();
        const fees = components.map(() => ZERO);

        await expect(subject())
          .to.emit(issuanceModule, "SetTokenRedeemed")
          .withArgs(subjectSetToken, subjectCaller.address, subjectTo, subjectRedeemQuantity, components, fees);
      });

      describe("when the issue quantity is extremely small", async () => {
        beforeEach(async () => {
          subjectRedeemQuantity = ONE;
        });

        it("should transfer the minimal units of components to the SetToken", async () => {
          const previousCallerBTCBalance = await setup.wbtc.balanceOf(subjectCaller.address);

          await subject();

          const afterCallerBTCBalance = await setup.wbtc.balanceOf(subjectCaller.address);
          expect(previousCallerBTCBalance).to.eq(afterCallerBTCBalance);
        });
      });

      describe("when the issue quantity is greater than the callers balance", async () => {
        beforeEach(async () => {
          subjectRedeemQuantity = ether(4);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ERC20: burn amount exceeds balance");
        });
      });

      describe("when one of the components has a recipient-related fee", async () => {
        beforeEach(async () => {
          // Add self as module and update the position state
          await setup.controller.addModule(owner.address);
          await setToken.addModule(owner.address);
          await setToken.initializeModule();

          const tokenWithFee = await deployer.mocks.deployTokenWithFeeMock(
            setToken.address,
            ether(20),
            ether(0.1),
          );

          const retrievedPosition = (await setToken.getPositions())[0];

          await setToken.addComponent(tokenWithFee.address);
          await setToken.editDefaultPositionUnit(tokenWithFee.address, retrievedPosition.unit);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid post transfer balance");
        });
      });

      describe("when a SetToken position is not in default state", async () => {
        beforeEach(async () => {
          // Add self as module and update the position state
          await setup.controller.addModule(owner.address);
          await setToken.addModule(owner.address);
          await setToken.initializeModule();

          const retrievedPosition = (await setToken.getPositions())[0];

          await setToken.addExternalPositionModule(
            retrievedPosition.component,
            retrievedPosition.module,
          );
          await setToken.editExternalPositionUnit(
            retrievedPosition.component,
            retrievedPosition.module,
            retrievedPosition.unit,
          );
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Only default positions are supported");
        });
      });

      describe("when the issue quantity is 0", async () => {
        beforeEach(async () => {
          subjectRedeemQuantity = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Redeem quantity must be > 0");
        });
      });

      describe("when the SetToken is not enabled on the controller", async () => {
        beforeEach(async () => {
          const nonEnabledSetToken = await setup.createNonControllerEnabledSetToken(
            [setup.weth.address],
            [ether(1)],
            [issuanceModule.address],
          );

          subjectSetToken = nonEnabledSetToken.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Must be a valid and initialized SetToken");
        });
      });

      describe("when set the redeem fee", async () => {
        beforeEach(async () => {
          feePercentage = ether(0.01);
          setup.controller = setup.controller.connect(owner.wallet);
          await setup.controller.addFee(issuanceModule.address, ZERO, feePercentage);
        });

        it("should send fee for all tokens", async () => {
          const beforeSetTokenWETHBalance = await setup.weth.balanceOf(setToken.address);
          const beforeSetTokenBTCBalance = await setup.wbtc.balanceOf(setToken.address);
          const feeRecipientAddress = await setup.controller.feeRecipient();
          const beforeFeeRecipientWETHBalance = await setup.weth.balanceOf(feeRecipientAddress);
          const beforeFeeRecipientBTCBalance = await setup.wbtc.balanceOf(feeRecipientAddress);
          expect(beforeFeeRecipientWETHBalance).to.eq(0);
          expect(beforeFeeRecipientBTCBalance).to.eq(0);
          const beforeRecipientWETHBalance = await setup.weth.balanceOf(recipient.address);
          const beforeRecipientBTCBalance = await setup.wbtc.balanceOf(recipient.address);
          expect(beforeRecipientWETHBalance).to.eq(0);
          expect(beforeRecipientBTCBalance).to.eq(0);

          await subject();

          const afterSetTokenWETHBalance = await setup.weth.balanceOf(setToken.address);
          const afterSetTokenBTCBalance = await setup.wbtc.balanceOf(setToken.address);
          const expectedAfterSetTokenWETHBalance = beforeSetTokenWETHBalance.div(2);
          const expectedAfterSetTokenBTCBalance = beforeSetTokenBTCBalance.div(2);
          expect(afterSetTokenWETHBalance).to.eq(expectedAfterSetTokenWETHBalance);
          expect(afterSetTokenBTCBalance).to.eq(expectedAfterSetTokenBTCBalance);

          const redeemBalance = await setToken.balanceOf(owner.address);
          expect(redeemBalance).to.eq(ether(1));
          const afterFeeRecipientWETHBalance = await setup.weth.balanceOf(feeRecipientAddress);
          const afterFeeRecipientBTCBalance = await setup.wbtc.balanceOf(feeRecipientAddress);

          // Half of the total amount is redeemed. Also, fees are 1/100 of the redeem amount.
          const expectedAfterFeeRecipientWETHBalance = beforeSetTokenWETHBalance.div(2).div(100);
          const expectedAfterFeeRecipientBTCBalance = beforeSetTokenBTCBalance.div(2).div(100);
          expect(afterFeeRecipientWETHBalance).to.eq(expectedAfterFeeRecipientWETHBalance);
          expect(afterFeeRecipientBTCBalance).to.eq(expectedAfterFeeRecipientBTCBalance);

          const afterRecipientWETHBalance = await setup.weth.balanceOf(recipient.address);
          const afterRecipientBTCBalance = await setup.wbtc.balanceOf(recipient.address);
          const receiveRecipientWETH = afterRecipientWETHBalance.sub(beforeRecipientWETHBalance);
          const receiveRecipientBTC = afterRecipientBTCBalance.sub(beforeRecipientBTCBalance);
          const expectReceiveRecipientWETH = beforeSetTokenWETHBalance
            .sub(afterSetTokenWETHBalance)
            .sub(afterFeeRecipientWETHBalance);
          const expectReceiveRecipientBTC = beforeSetTokenBTCBalance
            .sub(afterSetTokenBTCBalance)
            .sub(afterFeeRecipientBTCBalance);
          expect(receiveRecipientWETH).to.eq(expectReceiveRecipientWETH);
          expect(receiveRecipientBTC).to.eq(expectReceiveRecipientBTC);
        });

        it("should emit the SetTokenRedeemed event", async () => {
          const beforeSetTokenWETHBalance = await setup.weth.balanceOf(setToken.address);
          const beforeSetTokenBTCBalance = await setup.wbtc.balanceOf(setToken.address);

          // Half of the total amount is redeemed. Also, fees are 1/100 of the redeem amount.
          const expectedFeeWETH = beforeSetTokenWETHBalance.div(2).div(100);
          const expectedFeeBTC = beforeSetTokenBTCBalance.div(2).div(100);

          const components: string[] = await setToken.getComponents();
          const fees = components.map(component => component === setup.weth.address ? expectedFeeWETH : expectedFeeBTC);

          await expect(subject())
            .to.emit(issuanceModule, "SetTokenRedeemed")
            .withArgs(subjectSetToken, subjectCaller.address, subjectTo, subjectRedeemQuantity, components, fees);
        });
      });

      describe("when not set the redeem fee", async () => {
        beforeEach(async () => {
          feePercentage = BigNumber.from(0);
          setup.controller = setup.controller.connect(owner.wallet);
          await setup.controller.addFee(issuanceModule.address, ZERO, feePercentage);
        });

        it("should not send fees", async () => {
          const feeRecipientAddress = await setup.controller.feeRecipient();
          const beforeFeeRecipientWETHBalance = await setup.weth.balanceOf(feeRecipientAddress);
          const beforeFeeRecipientBTCBalance = await setup.wbtc.balanceOf(feeRecipientAddress);
          expect(beforeFeeRecipientWETHBalance).to.eq(0);
          expect(beforeFeeRecipientBTCBalance).to.eq(0);

          await subject();

          const redeemBalance = await setToken.balanceOf(owner.address);
          expect(redeemBalance).to.eq(ether(1));
          const afterFeeRecipientWETHBalance = await setup.weth.balanceOf(feeRecipientAddress);
          const afterFeeRecipientBTCBalance = await setup.wbtc.balanceOf(feeRecipientAddress);
          expect(afterFeeRecipientWETHBalance).to.eq(0);
          expect(afterFeeRecipientBTCBalance).to.eq(0);
        });
      });

      describe("When zero is set after setting the fees once", async () => {
        beforeEach(async () => {
          feePercentage = ether(0.01);
          setup.controller = setup.controller.connect(owner.wallet);
          await setup.controller.addFee(issuanceModule.address, ZERO, feePercentage);
          feePercentage = BigNumber.from(0);
          setup.controller = setup.controller.connect(owner.wallet);
          await setup.controller.editFee(issuanceModule.address, ZERO, feePercentage);
        });

        it("should not send fees", async () => {
          const feeRecipientAddress = await setup.controller.feeRecipient();
          const beforeFeeRecipientWETHBalance = await setup.weth.balanceOf(feeRecipientAddress);
          const beforeFeeRecipientBTCBalance = await setup.wbtc.balanceOf(feeRecipientAddress);
          expect(beforeFeeRecipientWETHBalance).to.eq(0);
          expect(beforeFeeRecipientBTCBalance).to.eq(0);

          await subject();

          const redeemBalance = await setToken.balanceOf(owner.address);
          expect(redeemBalance).to.eq(ether(1));
          const afterFeeRecipientWETHBalance = await setup.weth.balanceOf(feeRecipientAddress);
          const afterFeeRecipientBTCBalance = await setup.wbtc.balanceOf(feeRecipientAddress);
          expect(afterFeeRecipientWETHBalance).to.eq(0);
          expect(afterFeeRecipientBTCBalance).to.eq(0);
        });
      });
    });
  });

  describe("#pause", async () => {
    context("When the owner", async () => {
      context("When not paused", async () => {
        it("should paused status be true", async () => {
          expect(await issuanceModule.paused()).to.eq(false);
          await issuanceModule.connect(owner.wallet).pause();
          expect(await issuanceModule.paused()).to.eq(true);
        });
      });

      context("When paused", async () => {
        it("should revert", async () => {
          await issuanceModule.connect(owner.wallet).pause();
          expect(await issuanceModule.paused()).to.eq(true);
          await expect(issuanceModule.connect(owner.wallet).pause()).to.be.revertedWith(
            "Pausable: paused",
          );
        });
      });
    });

    context("When the wrong owner", async () => {
      context("When not paused", async () => {
        it("should revert", async () => {
          expect(await issuanceModule.paused()).to.eq(false);
          await expect(issuanceModule.connect(recipient.wallet).pause()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });
      });

      context("When paused", async () => {
        it("should revert", async () => {
          await issuanceModule.connect(owner.wallet).pause();
          expect(await issuanceModule.paused()).to.eq(true);
          await expect(issuanceModule.connect(recipient.wallet).pause()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });
      });
    });
  });

  describe("#unpause", async () => {
    context("When the owner", async () => {
      context("When not paused", async () => {
        it("should revert", async () => {
          expect(await issuanceModule.paused()).to.eq(false);
          await expect(issuanceModule.connect(owner.wallet).unpause()).to.be.revertedWith(
            "Pausable: not paused",
          );
        });
      });

      context("When paused", async () => {
        it("should paused status be false", async () => {
          await issuanceModule.connect(owner.wallet).pause();
          expect(await issuanceModule.paused()).to.eq(true);
          await issuanceModule.connect(owner.wallet).unpause();
          expect(await issuanceModule.paused()).to.eq(false);
        });
      });
    });

    context("When the wrong owner", async () => {
      context("When not paused", async () => {
        it("should revert", async () => {
          expect(await issuanceModule.paused()).to.eq(false);
          await expect(issuanceModule.connect(recipient.wallet).unpause()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });
      });

      context("When paused", async () => {
        it("should revert", async () => {
          await issuanceModule.connect(owner.wallet).pause();
          expect(await issuanceModule.paused()).to.eq(true);
          await issuanceModule.connect(owner.wallet).unpause();
          await expect(issuanceModule.connect(recipient.wallet).unpause()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });
      });
    });
  });

  describe("#getRequiredComponentUnitsForRedeem", async () => {
    let setToken: SetToken;
    let feePercentage: BigNumber;
    let subjectSetToken: Address;
    let subjectRedeemQuantity: BigNumber;

    beforeEach(async () => {
      setToken = await setup.createSetToken(
        [setup.weth.address, setup.wbtc.address],
        [ether(1), bitcoin(2)],
        [issuanceModule.address],
      );
      await issuanceModule.initialize(setToken.address, ADDRESS_ZERO);
      feePercentage = ether(0.01);
      setup.controller = setup.controller.connect(owner.wallet);
      await setup.controller.addFee(issuanceModule.address, ZERO, feePercentage);

      subjectSetToken = setToken.address;
      subjectRedeemQuantity = ether(1);
    });

    context("When the argument of a valid setToken", async () => {
      context("When SetToken has not an external position", async () => {
        it("should be returned with the unit subtracted from the fee", async () => {
          const componentAddressAndUnits = await issuanceModule.getRequiredComponentUnitsForRedeem(
            subjectSetToken,
            subjectRedeemQuantity,
          );
          const componentAddresses = componentAddressAndUnits[0];
          const componentUnits = componentAddressAndUnits[1];
          const componentFees = componentAddressAndUnits[2];
          const arrayIndexETH = componentAddresses.indexOf(setup.weth.address);
          const arrayIndexBTC = componentAddresses.indexOf(setup.wbtc.address);
          const expectComponentFeeWETH = ether(1).mul(feePercentage).div(PRECISE_UNIT);
          const expectComponentFeeBTC = bitcoin(2).mul(feePercentage).div(PRECISE_UNIT);
          const expectComponentWETH = ether(1).sub(expectComponentFeeWETH);
          const expectComponentBTC = bitcoin(2).sub(expectComponentFeeBTC);
          expect(componentUnits[arrayIndexETH]).to.eq(expectComponentWETH);
          expect(componentUnits[arrayIndexBTC]).to.eq(expectComponentBTC);
          expect(componentFees[arrayIndexETH]).to.eq(expectComponentFeeWETH);
          expect(componentFees[arrayIndexBTC]).to.eq(expectComponentFeeBTC);
        });
      });

      context("When the fee is changed", async () => {
        it("should paused status be false", async () => {
          // before the change of fee
          const componentAddressAndUnits = await issuanceModule.getRequiredComponentUnitsForRedeem(
            subjectSetToken,
            subjectRedeemQuantity,
          );
          const componentAddresses = componentAddressAndUnits[0];
          const componentUnits = componentAddressAndUnits[1];
          const componentFees = componentAddressAndUnits[2];
          const arrayIndexETH = componentAddresses.indexOf(setup.weth.address);
          const arrayIndexBTC = componentAddresses.indexOf(setup.wbtc.address);
          const expectComponentFeeWETH = ether(1).mul(feePercentage).div(PRECISE_UNIT);
          const expectComponentFeeBTC = bitcoin(2).mul(feePercentage).div(PRECISE_UNIT);
          const expectComponentWETH = ether(1).sub(expectComponentFeeWETH);
          const expectComponentBTC = bitcoin(2).sub(expectComponentFeeBTC);
          expect(componentUnits[arrayIndexETH]).to.eq(expectComponentWETH);
          expect(componentUnits[arrayIndexBTC]).to.eq(expectComponentBTC);
          expect(componentFees[arrayIndexETH]).to.eq(expectComponentFeeWETH);
          expect(componentFees[arrayIndexBTC]).to.eq(expectComponentFeeBTC);
          // after the change of fee
          const updateFeePercentage = ether(0.05);
          setup.controller = setup.controller.connect(owner.wallet);
          await setup.controller.editFee(issuanceModule.address, ZERO, updateFeePercentage);
          const updateComponentAddressAndUnits = await issuanceModule.getRequiredComponentUnitsForRedeem(
            subjectSetToken,
            subjectRedeemQuantity,
          );
          const updateComponentUnits = updateComponentAddressAndUnits[1];
          const updateComponentFees = updateComponentAddressAndUnits[2];
          const expectUpdateComponentFeeWETH = ether(1).mul(updateFeePercentage).div(PRECISE_UNIT);
          const expectUpdateComponentFeeBTC = bitcoin(2).mul(updateFeePercentage).div(PRECISE_UNIT);
          const expectUpdateComponentWETH = ether(1).sub(expectUpdateComponentFeeWETH);
          const expectUpdateComponentBTC = bitcoin(2).sub(expectUpdateComponentFeeBTC);
          expect(updateComponentUnits[arrayIndexETH]).to.eq(expectUpdateComponentWETH);
          expect(updateComponentUnits[arrayIndexBTC]).to.eq(expectUpdateComponentBTC);
          expect(updateComponentFees[arrayIndexETH]).to.eq(expectUpdateComponentFeeWETH);
          expect(updateComponentFees[arrayIndexBTC]).to.eq(expectUpdateComponentFeeBTC);
        });
      });

      context("When SetToken has an external position", async () => {
        beforeEach(async () => {
          await setup.controller.addModule(owner.address);
          await setToken.addModule(owner.address);
          await setToken.initializeModule();

          const retrievedPosition = (await setToken.getPositions())[0];

          await setToken.addExternalPositionModule(
            retrievedPosition.component,
            retrievedPosition.module,
          );
          await setToken.editExternalPositionUnit(
            retrievedPosition.component,
            retrievedPosition.module,
            retrievedPosition.unit,
          );
        });

        it("should revert", async () => {
          await expect(
            issuanceModule.getRequiredComponentUnitsForRedeem(
              setToken.address,
              subjectRedeemQuantity,
            ),
          ).to.be.revertedWith("Only default positions are supported");
        });
      });
    });

    context("When the argument of a invalid setToken", async () => {
      context("When not paused", async () => {
        it("should revert", async () => {
          await expect(
            issuanceModule.getRequiredComponentUnitsForRedeem(ADDRESS_ZERO, subjectRedeemQuantity),
          ).to.be.revertedWith("Must be a valid and initialized SetToken");
        });
      });
    });
  });
});
