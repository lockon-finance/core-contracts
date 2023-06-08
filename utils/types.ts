import { BigNumber } from "ethers";
import {
  ContractTransaction as ContractTransactionType,
  Wallet as WalletType
} from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

export type Address = string;
export type Bytes = string;

export type Account = {
  address: Address;
  wallet: SignerWithAddress;
};

export type Position = {
  component: Address;
  module: Address;
  unit: BigNumber;
  positionState: number;
  data: string;
};

export type ContractTransaction = ContractTransactionType;
export type Wallet = WalletType;

export interface StreamingFeeState {
  feeRecipient: Address;
  streamingFeePercentage: BigNumber;
  maxStreamingFeePercentage: BigNumber;
  lastStreamingFeeTimestamp: BigNumber;
}

export interface AirdropSettings {
  airdrops: Address[];
  feeRecipient: Address;
  airdropFee: BigNumber;
  anyoneAbsorb: boolean;
}

export interface CustomOracleNAVIssuanceSettings {
  managerIssuanceHook: Address;
  managerRedemptionHook: Address;
  setValuer: Address;
  reserveAssets: Address[];
  feeRecipient: Address;
  managerFees: [BigNumber, BigNumber];
  maxManagerFee: BigNumber;
  premiumPercentage: BigNumber;
  maxPremiumPercentage: BigNumber;
  minSetTokenSupply: BigNumber;
}
