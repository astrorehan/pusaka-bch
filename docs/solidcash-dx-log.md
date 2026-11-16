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
- **A payout loop cannot be combined with a time check.** Reduced to `contracts/ReproLoop.scash` and `test/repro/loop-transfers.test.ts` (two payees, mock network, real limits):

  | Function body | Outputs | Result |
  |---|---|---|
  | `for` loop of `this.transfer`, no time check | derived by the SDK | OK |
  | same, `.setLocktime(t)` on the call | derived | OK |
  | same | explicit `.transfer()` calls | `messageBus: BCH-2026 preflight failed at input 0: Program failed an OP_VERIFY operation` |
  | `require(tx.time >= deadline)` + loop | derived | `VM failed at ip 14 opcode 82 (OP_VERIFY)` |
  | `require(tx.time >= deadline)` + loop | explicit | preflight failure as above |
  | `require(tx.time >= deadline)` after the loop | derived | `VM failed at ip 14` |
  | `require(tx.locktime >= deadline)` + loop | derived | `VM failed at ip 14` |
  | `require(tx.time >= deadline)` + two unrolled `this.transfer` | derived | `VM failed at ip 14` |
  | `require(tx.time >= deadline)` + two unrolled `this.transfer` | explicit | OK |

  So two separate problems: (1) when the SDK derives the outputs, any function that reads `tx.time` or `tx.locktime` and transfers fails early (ip 14), perhaps because the derivation run does not use the call's locktime (guess); (2) explicit `.transfer()` outputs fail the preflight whenever the transfers come from a loop. A time-locked payout therefore needs explicit outputs, which need unrolled transfers. Pusaka uses ten guarded slots (`if (i < len) this.transfer(...)`) and caps heirs at 10. To report upstream with this table.
- `initialState: { heirs: [...] }` is silently ignored for a dynamic struct array (state comes back `[]`); passing the array through a `constructor(Heir[] ...)` works. A warning or error would save time.
- An early `distribute` fails with the CLTV locktime message, not the contract's custom error, because the transaction's locktime check fails first.
- `npx solidhat test` on Windows prints the compile lines and exits 0 without running any test. `npx vitest run -c vitest.solidhat.config.ts` runs them.
- The mock's default consensus limits are relaxed (1 MB inputs, 1 MB NFT commitments, no dust check). The README says so, but the TypeScript template keeps the relaxed mock, so a new project's green tests say little about chain validity. We set the mock to the real 2026 limits (10,000-byte inputs and stack items, 128-byte commitments, dust enforced) in `solidcash.config.ts`; all tests still pass. Suggest making the strict limits the template default.
- Measured under those limits: `distribute` to 10 heirs is a 12,077-byte transaction with 16 inputs (master NFT, data NFTs, array chunks, satoshi container, caller's coin), about 12,000 satoshis in fees at 1 sat/byte. The caller's own coin pays the fee.

**First run on Chipnet (`contract/scripts/chipnet-flow.ts`, 15 Nov, about 06:51-06:54 UTC)**

The whole lifecycle ran on the real Chipnet network through SolidHat's Electrum provider, with no change to the contract:

| Step | Transaction | Size |
|---|---|---|
| Vault A deployed (20,000 sats, 6 heirs) | `993866968a678b289f1b2a9a5cd0f779f8114c8ea333a4cf7b4d519b7704c38d` | |
| Owner check-in, deadline moved to locktime + 30 days | `73dabfc17d3804fb6a6351a60885a07764c0cf0075fbd2d86c0195c3e34f2a12` | 9,209 bytes |
| Owner withdraw, container left at 0 | `f3224bea4dc84c83ac3cd37e678b8088df4c85ab364e2895d853e7308df4a439` | 9,085 bytes |
| Vault B deployed with its deadline an hour behind the network clock (60,000 sats) | `3cb2d009d793c3e4bc75c14228461f61a60ea7fb3fd8099c0de01f604ad4956d` | |
| Payout to all 6 faraid heirs, each exactly `pot × share ÷ 120` | `d76ffee1296a7d11cc94719e696ed57cdd8781a1389f7fda71eaa66ad48e25ad` | 11,896 bytes, 16 inputs, 17 outputs, fee 12,086 sats (1.02 sat/byte) |

- Chipnet's median time past was 4,449 seconds (about 74 minutes) behind the clock. A timestamp locktime must be below it, so a check-in sets the deadline about an hour earlier than "now + period". The app should say so, or add the lag to the period.
- The SolidHat scripts have no `time.latest()` on a live network; the script reads the last 11 block headers over Electrum (`blockchain.block.header`) and takes the median. A helper for this in the SDK would help anyone using `tx.time`.
- Fees: each stateful call is 9-12 KB, about 9,000-12,000 sats at 1 sat/byte, paid from the caller's own coins (the SDK also swept several of the caller's small change coins into the payout transaction).

**Wallet signing for stateful calls (`contract/scripts/external-signing-spike.ts`, 16 Nov, about 03:16-03:28 UTC)**

The web app cannot hold keys, so every transaction must be signed by the user's wallet over `bch_signTransaction` (the request WizardConnect also carries). The SDK has `Signer.external({ wallet, address, publicKey })` for this. The spike runs the whole lifecycle on Chipnet with only the SDK (`ContractFactory`, `StatefulContract`) and a stand-in wallet that signs exactly what the protocol hands it.

- **Deploy works as shipped.** Two wallet requests: a 185-byte coin split, then the 952-byte genesis.
- **Every stateful call failed before the fix.** The message bus path (`.call.checkIn().send()`) judges every input in `preflight.js` while the wallet's input still holds its all-zero placeholder, so it stopped with `preflight failed at input 2` (`OP_VERIFY` without the public key, `NULLFAIL` with it). With the preflight fixed, the node refused the broadcast (`Signature must be zero for failed CHECK(MULTI)SIG`), because `stb-submit-final-transaction.js` broadcasts the placeholder bytes. `TransactionBuilder.send` and the framed call path call `applyExternalSignatures`; the stateful message-bus path never does.
- **Fix** (`contract/patches/@solidcash+solidcash+0.50.1.patch`, applied with patch-package): skip a wallet input in `evaluateEveryInput` while it still holds the placeholder, and call `applyExternalSignatures` in `submitFinalTransaction` (and in `sendPreflightedMessageBusTransaction`) before the bytes go out. The placeholder has the signature's size, so the fee is unchanged. To send upstream as a PR.
- **After the fix**, all on Chipnet through the wallet:

  | Step | Transaction | Wallet request |
  |---|---|---|
  | I'm still here (deadline moved by exactly the period) | `cf6ffd83dc7fed321ed158ad40416dec90b2c176c6429233dab40b95e0381c80` | 3 inputs, wallet signs 1 |
  | Take back | `62dfa7e0e090357643fcf6e832bfdcbeb2669dd0360150cf46adaec711793d1a` | 3 inputs, wallet signs 1 |
  | Send to 6 heirs, paid by a stranger's wallet | `187ac29671c0c75ff40fdf9ab0ceb421f3e08e53e9167173402b62290d13a90c` | 16 inputs, wallet signs 11 |

- **Attach from a link** needs the static constructor arguments and the category: `new StatefulContract(new Contract(artifact, [ownerPkh, period, total, feeBudget], { provider }), categoryId)`. `ContractFactory.attach(category)` alone fails ("Expected 4 arguments"). The category is not the genesis txid but the txid of the coin the genesis spends first (`deployed.categoryId`); passing the genesis txid gives "Expected 1 data NFT(s) ... found 0".
- **`distribute` wants 11 separate coins from the caller.** A wallet with one coin is first asked to sign a split into 11 (`Signer has 0 available plain UTXO(s) but 11 funder(s) needed` when it has none). So a visitor pressing "Send to heirs" signs twice. Worth asking whether the funder count can be lower.
- `STB debug() best-effort error: Cannot debug a transaction with custom unlocker` is printed on every wallet-signed call. Harmless, but it reads like a failure.
- `ElectrumNetworkProvider` has no `getBalance`; sum `getUtxos(address)`.
- **WizardConnect** (`@wizardconnect/dapp` 0.2.x) carries the same `WcSignTransactionRequest` plus `inputPaths: [inputIndex, "receive" | "change", addressIndex]`, and the relay chunks large messages. It is an HD session (xpubs), while `Signer.external` and the contract's owner check name one address. An HD wallet moves change to new addresses, so the app must keep the owner's coins at the plan's owner address or consolidate them there before a call.

**The upstream form of the fix on Chipnet (16 Nov, about 05:14-05:17 UTC)**

The fix prepared for upstream (`D:/project/lomba/solidcash-upstream`, branch `fix/external-signer-stateful-calls`: rebuilt 0.50.1 sources, the fix, and 4 regression tests) was compiled, swapped into the published `dist` with our patch removed, and run through `external-signing-spike.ts` on Chipnet: deploy `abacf5dee5eee019da552d549ef52f13d04928f9b35001218c37b1b15d8a9969`, check-in `f88794544ba68b4b91373943f2c3a0900a493dddbd918e6706f6e58ac3935b92` (deadline moved by exactly the period), withdraw `9e08246c0b5b26c50e7fbddedb94cfd9d54294f6dbde70eb1cd81fd267bab941`, payout by another wallet `a212685bd010dd1fa19d3b782cd6dbfccc3efcebbc2ffdd36197a690d53066b0`. The SDK's default Chipnet Electrum server (`chipnet.bch.ninja`) dropped or timed out several connections during the run; `chipnet.imaginary.cash` worked (the spike takes `ELECTRUM_HOST`).

**The app's own chain layer on Chipnet (`app/scripts/chain-e2e.ts`, 16 Nov, about 03:42-03:48 UTC)**

The web app's `src/lib/chain` code, driven from Node with a stand-in WizardConnect manager that signs by `inputPaths`:

| Step | Transaction | Wallet request |
|---|---|---|
| Gather coins from receive/1 at the owner address (receive/0) | (sent by `ensureCoinsAtOwner`) | 2 inputs at `receive/1` |
| Create plan (3 heirs, 30,000 sats for heirs + 2,000 fee budget) | `7b9ef747c27c4f625e86742355eceb3ad8b278a85bcc0140913934622f4b1104` | 1 input at `receive/0` |
| I'm still here | `41a8dca9e1d8ebc51a54555cfaeb153e20a989a27ddd7d9d8213ab2658e54b3f` | 3 inputs, wallet signs 1 |
| Send to heirs (7,377 / 9,836 / 12,786) | `703506e9e43f47ba80c481fd6e6452f3e67e5454f06f334cb9304f2eb7eddb5f` | 15 inputs, wallet signs 11 |

- Reading state needs a connected contract: `new StatefulContract(contract, category).state.deadline()` on an unconnected instance fails with "Expected 1 data NFT(s) ... found 0"; `.connect(provider)` works.
- A timestamp locktime is final only below the median time past, and the contract needs `locktime >= deadline`, so a payout works only once the network clock is strictly past the deadline. Our first try at clock == deadline failed in preflight after the wallet had already signed a coin split.
- **Design gap in our contract:** the payout's network fee is paid by the presser's own coins, so the plan's `feeBudget` is never spent; it stays locked in the plan with the rounding dust (2,001 sats here). Either pay the fee from the fee budget or drop it.

**Tooling**

- `solidhat compile` only picks up `.scash` files directly inside `contracts/`; a file in `contracts/repro/` was silently not compiled, and the test then failed with "no SolidCash artifact named ...". Hardhat compiles subfolders, so ported projects will expect it. (Not checked whether a config option exists.)
