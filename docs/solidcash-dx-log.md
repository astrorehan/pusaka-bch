# SolidCash developer-experience log

A dated log of porting Pusaka (an inheritance contract first written in Solidity for Monad) to Bitcoin Cash with SolidCash during BCH BLAZE 2026. What was easy, what broke, workarounds, and links to issues or pull requests.

Versions: `@solidcash/solidhat` 0.50.0, `@solidcash/solidc` 0.50.0, `@solidcash/solidcash` 0.50.1, Node 24.11, Windows 11.

## 15 Nov 2026

**Project setup**

- `npm create @solidcash/solidhat@0.50.0 contract` failed on Windows with `ECOMPROMISED: Lock compromised`, also with a fresh npm cache. The error comes from npm's own `npm exec` lock (`libnpmexec/lib/with-lock.js`, npm 11.6.2), not from SolidHat. Workaround: install `@solidcash/create-solidhat` into a scratch folder and run `node <that folder>/node_modules/@solidcash/create-solidhat/dist/cli.js contract --template typescript --package-manager npm --yes`. Worth a line in the README for Windows users.
- The GitHub repository's `master` branch reports version `0.14.0-beta.1` in its `package.json` files, while npm has 0.50.x (published 7 Nov). The docs in the repo may therefore describe an older release than the one installed.
- The TypeScript template's sample (`Counter`) and test are minimal: the test only checks that a factory loads. A sample that sends a transaction and asserts a rejection would show new users the testing loop.

**Porting the CashScript prototype**

- The stateless prototype (`../prototype/vault.cash`, CashScript 0.14) compiled after changing the pragma to `pragma solidcash ^0.50.0;` and one line: with `evmCompat: true` (the template's default), `bytes.length` is `uint256`, so `int n = heirs.length / 24;` fails with "Type 'uint256' can not be assigned to variable of type 'int256'". Fix: `int n = int(heirs.length) / 24;`. Not a bug, but CashScript users porting code will hit it first; the error could suggest the cast.
- The SDK API matches CashScript closely (`Contract`, `TransactionBuilder`, `SignatureTemplate`, `randomUtxo`). `MockNetworkProvider` moved to the subpath `@solidcash/solidcash/network/mock`, and `addUtxo` is now async.
- Good surprise: SolidCash's `MockNetworkProvider` enforces BIP68 relative locktimes (`non-BIP68-final`), which CashScript's mock did not. Our prototype test had passed for a coin that was not actually old enough. The port now mines the waiting period with `provider.mine(n)` before the payout, and a new test proves a check-in really resets the timer. All 12 prototype cases plus that one pass.

**Compiling the original Monad contracts (`evmCompat`)**

- `FaraidLib.sol` (230 lines of plain Solidity 0.8.24: structs, enums, custom errors, exact fractions) compiles unchanged as a library.
- Calling `FaraidLib.compute()` from a contract fails: "Memory alias group 'pool, factor' reaches an operation that cannot yet preserve Solidity aliasing" at `Frac memory pool = add(add(s.mother, s.father), s.daughters);` inside `_radd`. Minimal reproduction (fails the same way; `evmCompat: true`):

  ```solidity
  pragma solidity ^0.8.24;
  contract AliasB {
      struct Frac { uint256 num; uint256 den; }
      function add(Frac memory a, Frac memory b) internal pure returns (Frac memory) {
          return Frac(a.num * b.den + b.num * a.den, a.den * b.den);
      }
      function check(uint256 x) public pure {
          Frac memory pool = Frac(x, 2);
          Frac memory factor = add(pool, Frac(1, 3)); // error: alias group 'pool, factor'
          require(factor.num > 0);
      }
  }
  ```

  Passing a local `memory` struct into an internal function that returns a `memory` struct is enough; reassignment is not needed. Passing only temporaries (`add(Frac(x, 2), Frac(1, 3))`) compiles. This is a common Solidity pattern (fraction and math libraries), so it blocks a lot of EVM code. To report upstream as an issue with this reproduction.

**Stateful version (`contracts/Pusaka.scash`)**

- Written in Solidity style: a `struct Heir`, a `Heir[]` state array, a `deadline` state variable, a `modifier` for the owner check, `event`s, a custom `error`, and the satoshi container (`this.balance`, `this.transfer`). Compiles with `evmCompat` on. 11 tests pass in solidhat: check-in moves the deadline, strangers are refused, nobody can pay out early, a check-in on day 29 keeps the heirs waiting, all 6 faraid heirs are paid exactly in one transaction, 1-satoshi underpayment and a swapped address are refused, 10 heirs work, 11 are refused, withdraw empties the vault.
- Owner check without a signature in the contract input: `require(tx.origin == new LockingBytecodeP2PKH(ownerPkh))`. `tx.origin` is the first P2PKH input without tokens, so the owner's wallet only signs its own ordinary coin. Compiles with a warning on every read.
- Time in seconds: `checkIn` sets `deadline = tx.locktime + period` (with `require(tx.locktime >= 500000000)` so the locktime is a timestamp), and `distribute` requires `tx.time >= this.deadline`. Nothing is counted in blocks, so the May 2027 one-minute-block upgrade does not change the waiting period.
- **A `for` loop of `this.transfer` cannot be combined with a locktime.** With `.setLocktime(t)` the call fails (`VM failed ... OP_VERIFY` when the SDK derives the outputs, `messageBus: BCH-2026 preflight failed at input 0` with explicit `.transfer()` calls). Hand-unrolled guarded slots (`if (i < len) this.transfer(...)`, ten of them) work, so the contract caps heirs at 10. To reduce to a minimal case and report.
- `initialState: { heirs: [...] }` is silently ignored for a dynamic struct array (state comes back `[]`); passing the array through a `constructor(Heir[] ...)` works. A warning or error would save time.
- An early `distribute` fails with the CLTV locktime message, not the contract's custom error, because the transaction's locktime check fails first.
- `npx solidhat test` on Windows prints the compile lines and exits 0 without running any test. `npx vitest run -c vitest.solidhat.config.ts` runs them.
- The mock's default consensus limits are relaxed (1 MB inputs, 1 MB NFT commitments, no dust check). The README says so, but the TypeScript template keeps the relaxed mock, so a new project's green tests say little about chain validity. We set the mock to the real 2026 limits (10,000-byte inputs and stack items, 128-byte commitments, dust enforced) in `solidcash.config.ts`; all tests still pass. Suggest making the strict limits the template default.
- Measured under those limits: `distribute` to 10 heirs is a 12,077-byte transaction with 16 inputs (master NFT, data NFTs, array chunks, satoshi container, caller's coin), about 12,000 satoshis in fees at 1 sat/byte. The caller's own coin pays the fee.
