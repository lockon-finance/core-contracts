import "module-alias/register";

import { ethers } from "ethers";
import { Address, Bytes } from "@utils/types";
import { Account } from "@utils/test/types";
import { ADDRESS_ZERO, ONE, ZERO } from "@utils/constants";
import { ZeroExApiV2Adapter } from "@utils/contracts";
import DeployHelper from "@utils/deploys";
import { addSnapshotBeforeRestoreAfterEach, getAccounts, getWaffleExpect } from "@utils/test/index";
import { BigNumber } from "ethers";

const expect = getWaffleExpect();

describe("ZeroExApiV2Adapter", () => {
  let owner: Account;
  const ethToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const sourceToken = "0x6cf5f1d59fddae3a688210953a512b6aee6ea643";
  const destToken = "0x5e5d0bea9d4a15db2d0837aff0435faba166190d";
  const otherToken = "0xae9902bb655de1a67f334d8661b3ae6a96723d5b";
  const wethToken = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const destination = "0x89b3515cad4f23c1deacea79fc12445cc21bd0e1";
  const otherDestination = "0xdeb100c55cccfd6e39753f78c8b0c3bcbef86157";
  const sourceQuantity = ONE;
  const minDestinationQuantity = ONE.mul(2);
  const otherQuantity = ONE.div(2);
  let deployer: DeployHelper;

  let allowanceHolderAddress: Address;
  let zeroExApiV2Adapter: ZeroExApiV2Adapter;

  const EXEC_SELECTOR = "0x2213bc0b";
  const INNER_SELECTOR = "0x1fff991f";

  const OPERATOR = ADDRESS_ZERO;
  const TARGET = ADDRESS_ZERO;

  before(async () => {
    [owner] = await getAccounts();
    deployer = new DeployHelper(owner.wallet);
    allowanceHolderAddress = "0x000000000000000000000000000000000000abcd";
    zeroExApiV2Adapter = await deployer.adapters.deployZeroExApiV2Adapter(
      allowanceHolderAddress,
      wethToken,
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    let subjectAllowanceHolderAddress: Address;
    let subjectWethAddress: Address;

    beforeEach(async () => {
      subjectAllowanceHolderAddress = allowanceHolderAddress;
      subjectWethAddress = wethToken;
    });

    async function subject(): Promise<ZeroExApiV2Adapter> {
      return await deployer.adapters.deployZeroExApiV2Adapter(
        subjectAllowanceHolderAddress,
        subjectWethAddress,
      );
    }

    it("should set the correct allowanceHolderAddress", async () => {
      const adapter = await subject();
      const actualAllowanceHolder = await adapter.getSpender();
      expect(actualAllowanceHolder.toLowerCase()).to.eq(
        subjectAllowanceHolderAddress.toLowerCase(),
      );
    });

    it("should set the correct wethAddress", async () => {
      const adapter = await subject();
      const actualWethAddress = await adapter.wethAddress();
      expect(actualWethAddress.toLowerCase()).to.eq(subjectWethAddress.toLowerCase());
    });

    it("should set the correct getSpender", async () => {
      const adapter = await subject();
      const actualSpender = await adapter.getSpender();
      expect(actualSpender.toLowerCase()).to.eq(subjectAllowanceHolderAddress.toLowerCase());
    });

    context("when allowanceHolderAddress is zero", async () => {
      beforeEach(async () => {
        subjectAllowanceHolderAddress = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("AllowanceHolder address is zero");
      });
    });

    context("when wethAddress is zero", async () => {
      beforeEach(async () => {
        subjectWethAddress = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("WETH address is zero");
      });
    });
  });

  describe("#generateDataParam", async () => {
    let subjectTo: Address;
    let subjectData: Bytes;

    beforeEach(async () => {
      subjectTo = allowanceHolderAddress;
      subjectData = `${EXEC_SELECTOR}1234`;
    });

    async function subject(): Promise<string> {
      return await zeroExApiV2Adapter.generateDataParam(subjectTo, subjectData);
    }

    it("should correctly encode the to address and data", async () => {
      const data = await subject();
      const expectedData = ethers.utils.solidityPack(
        ["address", "bytes"],
        [subjectTo, subjectData],
      );
      expect(data).to.eq(expectedData);
    });
  });

  describe("#getTradeCalldata", async () => {
    let subjectSourceToken: Address;
    let subjectDestinationToken: Address;
    let subjectDestinationAddress: Address;
    let subjectSourceQuantity: BigNumber;
    let subjectMinDestinationQuantity: BigNumber;
    let subjectData: Bytes;

    function createExecCalldata(
      inputToken: string,
      inputAmount: BigNumber,
      outputToken: string,
      minOutputAmount: BigNumber,
      recipient: string,
    ): string {
      const innerData = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "bytes[]", "bytes32"],
        [recipient, outputToken, minOutputAmount, [], ethers.constants.HashZero],
      );

      const innerDataWithSelector = ethers.utils.hexConcat([
        INNER_SELECTOR,
        `0x${innerData.slice(2)}`,
      ]);

      const execData = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "address", "bytes"],
        [OPERATOR, inputToken, inputAmount, TARGET, innerDataWithSelector],
      );

      return ethers.utils.hexConcat([EXEC_SELECTOR, `0x${execData.slice(2)}`]);
    }

    async function subject(): Promise<any> {
      return await zeroExApiV2Adapter.getTradeCalldata(
        subjectSourceToken,
        subjectDestinationToken,
        subjectDestinationAddress,
        subjectSourceQuantity,
        subjectMinDestinationQuantity,
        subjectData,
      );
    }

    beforeEach(async () => {
      subjectSourceToken = sourceToken;
      subjectDestinationToken = destToken;
      subjectDestinationAddress = destination;
      subjectSourceQuantity = sourceQuantity;
      subjectMinDestinationQuantity = minDestinationQuantity;

      const execCalldata = createExecCalldata(
        subjectSourceToken,
        subjectSourceQuantity,
        subjectDestinationToken,
        subjectMinDestinationQuantity,
        subjectDestinationAddress,
      );

      subjectData = await zeroExApiV2Adapter.generateDataParam(
        allowanceHolderAddress,
        execCalldata,
      );
    });

    it("should return the correct trade calldata", async () => {
      const [target, value, data] = await subject();
      const execCalldata = createExecCalldata(
        subjectSourceToken,
        subjectSourceQuantity,
        subjectDestinationToken,
        subjectMinDestinationQuantity,
        subjectDestinationAddress,
      );
      expect(target.toLowerCase()).to.eq(allowanceHolderAddress.toLowerCase());
      expect(value).to.deep.eq(ZERO);
      expect(data).to.deep.eq(execCalldata);
    });

    context("when data length is insufficient", async () => {
      beforeEach(async () => {
        subjectData = "0x1234";
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Insufficient data for 'to' address");
      });
    });

    context("when exec selector is invalid", async () => {
      beforeEach(async () => {
        const invalidSelector = "0xdeadbeef";
        const execDataBody = createExecCalldata(
          subjectSourceToken,
          subjectSourceQuantity,
          subjectDestinationToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        ).slice(10);

        const execCalldata = `${invalidSelector}${execDataBody.slice(2)}`;
        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid exec selector");
      });
    });

    context("when inner function selector is invalid", async () => {
      beforeEach(async () => {
        const innerData = ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "bytes[]", "bytes32"],
          [
            subjectDestinationAddress,
            subjectDestinationToken,
            subjectMinDestinationQuantity,
            [],
            ethers.constants.HashZero,
          ],
        );

        const invalidInnerSelector = "0xbad00000";
        const innerDataWithSelector = ethers.utils.hexConcat([
          invalidInnerSelector,
          `0x${innerData.slice(2)}`,
        ]);

        const execData = ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "address", "bytes"],
          [OPERATOR, subjectSourceToken, subjectSourceQuantity, TARGET, innerDataWithSelector],
        );

        const execCalldata = ethers.utils.hexConcat([EXEC_SELECTOR, `0x${execData.slice(2)}`]);

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid execute selector");
      });
    });

    context("when params.to address is zero", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          subjectSourceToken,
          subjectSourceQuantity,
          subjectDestinationToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        );

        const zeroAddress = ADDRESS_ZERO;
        subjectData = ethers.utils.solidityPack(["address", "bytes"], [zeroAddress, execCalldata]);
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("To address is zero");
      });
    });

    context("when ETH is used as input token", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          ethToken,
          subjectSourceQuantity,
          subjectDestinationToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("ETH not supported");
      });
    });

    context("when ETH is used as output token", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          subjectSourceToken,
          subjectSourceQuantity,
          ethToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("ETH not supported");
      });
    });

    context("when input token does not match", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          otherToken,
          subjectSourceQuantity,
          subjectDestinationToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Mismatched input token");
      });
    });

    context("when output token does not match", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          subjectSourceToken,
          subjectSourceQuantity,
          otherToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Mismatched output token");
      });
    });

    context("when recipient does not match", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          subjectSourceToken,
          subjectSourceQuantity,
          subjectDestinationToken,
          subjectMinDestinationQuantity,
          otherDestination,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Mismatched recipient");
      });
    });

    context("when input token amount does not match", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          subjectSourceToken,
          otherQuantity,
          subjectDestinationToken,
          subjectMinDestinationQuantity,
          subjectDestinationAddress,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Mismatched input token quantity");
      });
    });

    context("when min output token amount does not match", async () => {
      beforeEach(async () => {
        const execCalldata = createExecCalldata(
          subjectSourceToken,
          subjectSourceQuantity,
          subjectDestinationToken,
          otherQuantity,
          subjectDestinationAddress,
        );

        subjectData = await zeroExApiV2Adapter.generateDataParam(
          allowanceHolderAddress,
          execCalldata,
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Mismatched output token quantity");
      });
    });

    context("when data for function selector is insufficient", async () => {
      beforeEach(async () => {
        const insufficientData = "0x12";
        subjectData = ethers.utils.solidityPack(
          ["address", "bytes"],
          [allowanceHolderAddress, insufficientData],
        );
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Insufficient data for function selector");
      });
    });

    context("when exec data is valid but inner data is missing", async () => {
      beforeEach(async () => {
        const selectorOnly = EXEC_SELECTOR;
        subjectData = ethers.utils.solidityPack(
          ["address", "bytes"],
          [allowanceHolderAddress, selectorOnly],
        );
      });

      it("should revert with decode error", async () => {
        await expect(subject()).to.be.reverted;
      });
    });

    context("when exec data is too short for decoding", async () => {
      beforeEach(async () => {
        const shortData = ethers.utils.hexConcat([EXEC_SELECTOR, "0x1234"]);
        subjectData = ethers.utils.solidityPack(
          ["address", "bytes"],
          [allowanceHolderAddress, shortData],
        );
      });

      it("should revert with decode error", async () => {
        await expect(subject()).to.be.reverted;
      });
    });
  });
});
