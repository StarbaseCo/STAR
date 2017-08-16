[![Build Status](https://circleci.com/gh/StarbaseCo/STAR.svg?style=shield&circle-token=b596b3c121d3bd6baf156cecf7d39763abb1a031)](https://circleci.com/gh/StarbaseCo/STAR)

# STAR

STAR Token, native token of Starbase platform (Video introduction: https://www.youtube.com/watch?v=OrOzZS4lHgA),

## First Thing's First

There are a few simple guidelines when working on Starbase Contracts:

- **Do not write untested code.**
- If you must write untested code, clearly document why you are writing untested code.
- Smart Contract Development is hard and we are going to be dealing with the company's and/or user's money. Write tests for your code, ask others to review it and don't reinvent the wheel if they are well tested and proven solutions out there. Libraries such as [OpenZeppelin](https://github.com/OpenZeppelin/zeppelin-solidity/) are a great reference for community driven and tested smart contracts.

## Speak Things Into Being

The process is based around "speaking things into being," not creating things and then describing them later.

This approach has a variety of benefits.

- If we can't clearly describe something, we probably don't actually understand what we're trying to do. This will be reflected in the contract. Exploration and experimentation are encouraged -- just not in commits.

- By putting documentation and testing first, we ensure that we always have an up-to-date specification for the system. This helps us stay focused on **what** we're doing rather than **how** we're doing it. **How** will always change quickly. **What** will change as well, but less often.

- By creating a common language together, our mental map of the system will remain more accurate. When changes need to be made, it is easier to see and discuss how concepts relate rather than how cogs of a complex machine relate. Our understanding should drive our structure, not vice versa.

## Docs
For dynamic generated docs we use [doxity](https://github.com/DigixGlobal/doxity)

If you want to generate docs yourself, install doxity via npm and follow the instructions on [doxity's repo](https://github.com/DigixGlobal/doxity)
** Update **
It has been a bit tricky to update the docs once the docs are created. This is the steps taken to update the docs.

- `npm install --only=dev @digix/doxity`
- `node_modules/.bin/doxity init`

Then go to file `node_modules/@digix/doxity/lib/compile/solc.js:12`
Change the line with `if (_fs2.default.existsSync(process.env.PWD + '/truffle.js'))` to `if (false)`. For some reason the truffle solc compiler does not work properly with doxity. Change the code so it uses the native solc compiler.

Proceed:

- `node_modules/.bin/doxity build`

To see the smart contracts documentation in the development environment, please run the following command:

- `cd scripts/doxity/ && node_modules/.bin/gatsby develop`

## Development

**Dependencies**

- `node@6.x.x`
- `truffle@^3.x.x`
- `ethereumjs-testrpc@^4.x.x`
- `zeppelin-solidity@1.2.X`

## Setting Up

- Clone this repository.

- Install all [system dependencies](#development).
  - `npm install`

- Compile contract code
  - `truffle compile`

- Start testrpc server
  - `testrpc --accounts="10"`

- Deploy contracts
 - `node_modules/.bin/truffle migrate`

## Running tests
  - `node_modules/.bin/truffle test`

**Testing Pattern**
- a good pattern to use, when testing restrictions on contract is to structure this way:

```javascript
describe("testing user restriction", () => {
    beforeEach("deploy and prepare", () => {
        // Deploy a contract(s) and prepare it up
        // to the pass / fail point
    })

    it("test the failing user", () => {
        // Test something with the bad user
        // in as few steps as possible
    })

    it("test the good user", () => {
        // Test the VERY SAME steps,
        // with only difference being the good user
    })
})
```
