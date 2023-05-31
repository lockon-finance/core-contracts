# LOCKON Core Contract Repository 
Fork of the [SetProtocol/set-protocol-v2](https://github.com/SetProtocol/set-protocol-v2) project. 
This repository contains modifications and added features that are specially designed to meet our unique needs and requirements.

## Contracts
[Set Protocol](https://setprotocol.com/) is a specification for tokenized asset management strategies on the ethereum blockchain written in the Solidity programming language. We use [Hardhat](https://hardhat.org/) as a development environment for compiling, testing, and deploying our contracts.

## Development

To use console.log during Solidity development, follow the [guides](https://hardhat.org/guides/hardhat-console.html).


## Install Dependencies

`yarn`

## Available Functionality

### Run Hardhat EVM

`yarn chain`

### Build Contracts

`yarn compile`

### Generate TypeChain Typings

`yarn build`

### Run Contract Tests

`yarn test` OR `yarn test:fork` to run compiled contracts

`yarn test:clean` if contracts have been typings need to be updated

### Run Coverage Report for Tests

`yarn coverage`


[22]: https://www.npmjs.com/package/hardhat
[23]: https://www.npmjs.com/package/typechain


## Security

### TODO: Independent Audits

### Code Coverage

All smart contracts are tested and have 100% line and branch coverage.

### Vulnerability Disclosure Policy

The disclosure of security vulnerabilities helps us ensure the security of our users.

**How to report a security vulnerability?**

If you believe you’ve found a security vulnerability in one of our contracts or platforms,
send it to us by emailing [security@lockon.finance](mailto:security@lockon.finance).
Please include the following details with your report:

* A description of the location and potential impact of the vulnerability.

* A detailed description of the steps required to reproduce the vulnerability.

**Scope**

Any vulnerability not previously disclosed by us or our independent auditors in their reports.
