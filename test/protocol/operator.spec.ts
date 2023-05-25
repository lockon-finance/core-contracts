import "module-alias/register";

import { Account } from "@utils/test/types";
import { Operator } from "@utils/contracts";
import DeployHelper from "@utils/deploys";
import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts,
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("Operator [ @forked-mainnet ]", () => {
  let owner: Account;
  let bob: Account;
  let alice: Account;
  let deployer: DeployHelper;
  let operator: Operator;

  const setDefaultOperator = async () => {
    await operator.connect(owner.wallet).addOperator(bob.address);
  };

  beforeEach(async () => {
    [
      owner,
      bob,
      alice,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);
    operator = await deployer.core.deployOperator();
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#addOperator", async () => {
    async function subject(caller: Account, address: string): Promise<any> {
      operator = operator.connect(caller.wallet);
      return await operator.addOperator(address);
    }

    describe("When the caller is the owner", async () => {
      describe("When adding one operator", async () => {
        it("should be added to the operators", async () => {
          const beforeIsOperator = await operator.isOperator(bob.address);
          expect(beforeIsOperator).to.eq(false);

          await subject(owner, bob.address);

          const afterIsOperator = await operator.isOperator(bob.address);
          expect(afterIsOperator).to.eq(true);
        });
      });

      describe("When adding two operator", async () => {
        it("should be added to the operators", async () => {
          const beforeBobIsOperator = await operator.isOperator(bob.address);
          expect(beforeBobIsOperator).to.eq(false);

          await subject(owner, bob.address);

          const afterBobIsOperator = await operator.isOperator(bob.address);
          expect(afterBobIsOperator).to.eq(true);
          const beforeAliceOperator = await operator.isOperator(alice.address);
          expect(beforeAliceOperator).to.eq(false);

          await subject(owner, alice.address);

          const afterAliceIsOperator = await operator.isOperator(alice.address);
          expect(afterAliceIsOperator).to.eq(true);
        });
      });
    });

    describe("When the caller is not the owner", async () => {
      it("should revert", async () => {
        await expect(subject(bob, bob.address)).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#removeOperator", async () => {
    beforeEach(setDefaultOperator);

    async function subject(caller: Account, address: string): Promise<any> {
      operator = operator.connect(caller.wallet);
      await operator.removeOperator(address);
    }

    describe("When the caller is the owner", async () => {
      describe("When removing a registered operator.", async () => {
        it("should be removed from the operator register", async () => {
          const beforeIsOperator = await operator.isOperator(bob.address);
          expect(beforeIsOperator).to.eq(true);

          await subject(owner, bob.address);

          const afterIsOperator = await operator.isOperator(bob.address);
          expect(afterIsOperator).to.eq(false);
        });
      });

      describe("When deleting an unregistered operator", async () => {
        it("should revert", async () => {
          await expect(subject(owner, alice.address)).to.be.revertedWith("notExists");
        });
      });

      describe("When there are two operator registrations", async () => {
        it("Should only remove one operator", async () => {
          await operator.connect(owner.wallet).addOperator(alice.address);
          const bobIsOperator = await operator.isOperator(bob.address);
          expect(bobIsOperator).to.eq(true);
          const aliceOperator = await operator.isOperator(alice.address);
          expect(aliceOperator).to.eq(true);

          await subject(owner, bob.address);

          const afterBobIsOperator = await operator.isOperator(bob.address);
          expect(afterBobIsOperator).to.eq(false);
          const afterAliceIsOperator = await operator.isOperator(alice.address);
          expect(afterAliceIsOperator).to.eq(true);
        });
      });
    });

    describe("When the caller is not the owner", async () => {
      it("should revert", async () => {
        const beforeIsOperator = await operator.isOperator(bob.address);
        expect(beforeIsOperator).to.eq(true);
        await expect(subject(bob, bob.address)).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#getOperator", async () => {
    beforeEach(setDefaultOperator);

    async function subject(index: number): Promise<any> {
      return await operator.getOperator(index);
    }

    describe("When get a registered operator address.", async () => {
      it("should return the operator address", async () => {
        const operatorAddress = await subject(0);

        expect(operatorAddress).to.eq(bob.address);

        await operator.connect(owner.wallet).addOperator(alice.address);
        const operatorSecondAddress = await subject(1);

        expect(operatorSecondAddress).to.eq(alice.address);
      });
    });

    describe("When get an unregistered operator", async () => {
      it("should revert", async () => {
        await expect(subject(1)).to.be.revertedWith("EnumerableSet: index out of bounds");
      });
    });
  });

  describe("#getAllOperatorsLength", async () => {
    beforeEach(setDefaultOperator);

    async function subject(): Promise<any> {
      return await operator.getAllOperatorsLength();
    }

    it("should return the number of operators", async () => {
      const firstResult = await subject();

      expect(firstResult).to.eq(1);

      await operator.connect(owner.wallet).addOperator(alice.address);
      const secondResult = await subject();

      expect(secondResult).to.eq(2);
    });
  });

  describe("#isOperator", async () => {
    beforeEach(setDefaultOperator);

    async function subject(address: string): Promise<any> {
      return await operator.isOperator(address);
    }

    describe("When get a registered operator address.", async () => {
      it("should return true", async () => {
        const result = await subject(bob.address);

        expect(result).to.eq(true);
      });
    });

    describe("When get an unregistered operator", async () => {
      it("should return false", async () => {
        const result = await subject(alice.address);

        expect(result).to.eq(false);
      });
    });
  });
});
