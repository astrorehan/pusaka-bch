# SolidCash feedback from building Pusaka

For the SolidCash maintainer. Pusaka is an inheritance contract first written in Solidity for Monad and ported to
Bitcoin Cash with SolidCash during BCH BLAZE 2026. This list is the clean version of the dated
[developer log](solidcash-dx-log.md), ordered by how much each issue cost us or would cost the next developer.

Versions: `@solidcash/solidhat` 0.50.0, `@solidcash/solidc` 0.50.0, `@solidcash/solidcash` 0.50.1, Node 24.11,
npm 11.6.2, Windows 11. The contract: [`contract/contracts/Pusaka.scash`](../contract/contracts/Pusaka.scash).

**Fixed by us with a patch:** issue 1 ([`contract/patches/@solidcash+solidcash+0.50.1.patch`](../contract/patches/@solidcash+solidcash+0.50.1.patch),
applied with patch-package; the same file is in `app/patches/`).
**Worked around in our code:** issues 2, 3, 5, 6, 7 and 9. The rest are reports only.

**Upstream status:** issue 1 is filed as [solidcash/solidcash#3](https://github.com/solidcash/solidcash/issues/3)
(16 Nov 2026), with the patch and a regression test. Upstream `master` (0.51) has since made ordinary stateful calls ask
the wallet to sign; our pull request [solidcash/solidcash#7](https://github.com/solidcash/solidcash/pull/7) (17 Nov)
fixes the paths that still broadcast the placeholder: `StatefulContract.split` / `merge` and split/merge funding, with
six regression cases. The other items are reported here, each with a reproduction.

## Summary

| # | Issue | Impact | Status |
|---|---|---|---|
| 1 | Stateful calls cannot be signed by an outside wallet | Blocks every dapp that uses a user's wallet | **Fixed with a patch** |
| 2 | A payout loop cannot be combined with a time check | Forces unrolled code and a hard cap (10 heirs for us) | Worked around |
| 3 | `npx solidhat test` on Windows passes without running any test | A false green result | Worked around |
| 4 | Memory-aliasing error on a common Solidity struct pattern | Blocks many EVM libraries | Open |
| 5 | The template's mock uses relaxed limits | Green tests that may fail on chain | Worked around |
| 6 | `initialState` is silently ignored for a dynamic struct array | Wrong state with no error | Worked around |
| 7 | Re-attaching to a deployed stateful contract is undocumented | Hard for any app that reloads a contract | Worked around |
| 8 | A stateful call wants 11 separate coins from the caller | An extra wallet signature and higher fees | Open |
| 9 | No helper for the network's time on a live network | Time-locked calls fail or land an hour off | Worked around |
| 10 | An early time-locked call shows the locktime error, not the contract's | Confusing errors | Open |
| 11 | `solidhat compile` silently skips subfolders of `contracts/` | Missing artifacts with a misleading error | Open |
| 12 | `bytes.length` is `uint256` under `evmCompat` | First error most CashScript ports hit | Open |
| 13 | Noisy messages: a debug error on every wallet-signed call, a warning on every `tx.origin` | Reads like a failure | Open |
| 14 | Smaller gaps: no `getBalance`, HD wallets, docs drift, Windows install, a thin template | Friction | Open |
| Q | Four 1,000-sat outputs locked with `OP_1` in each payout | Unclear; a question, not a report | Question |

## 1. Stateful calls cannot be signed by an outside wallet (fixed with a patch)

**What happened.** A web app cannot hold keys, so every transaction must be signed by the user's wallet over
`bch_signTransaction`, the request WizardConnect carries. The SDK has `Signer.external({ wallet, address, publicKey })`
for this. Deploy works as shipped. Every stateful call failed:

1. The message-bus path (`.call.checkIn().send()`) runs `evaluateEveryInput` in `dist/message-bus/preflight.js`
   while the wallet's input still holds its all-zero placeholder signature, so it stops with
   `preflight failed at input 2` (`OP_VERIFY` without the public key, `NULLFAIL` with it).
2. With the preflight skipped for that input, the node refused the broadcast:
   `Signature must be zero for failed CHECK(MULTI)SIG`. `dist/stateful/stb-submit-final-transaction.js` broadcasts
   the placeholder bytes. `TransactionBuilder.send` and the framed call path call `applyExternalSignatures`; the
   stateful message-bus path never does.

**Reproduction.** [`contract/scripts/external-signing-spike.ts`](../contract/scripts/external-signing-spike.ts): the
whole lifecycle on Chipnet with only the SDK (`ContractFactory`, `StatefulContract`) and a stand-in wallet that signs
exactly what `bch_signTransaction` hands it. Without the patch, the first `checkIn` fails as above.

**Impact.** Any dapp whose users sign in their own wallet (Paytaca, Cashonize, any WizardConnect wallet) cannot call
a stateful function. For Pusaka it blocked I'm still here, take back and send to heirs.

**Our fix** (the patch, about 20 lines in two files):

- In `evaluateEveryInput`, skip an input whose unlocker is externally signed while it still holds the placeholder.
  Our reasoning: no covenant reads another input's unlocking bytecode, so that input can be judged after signing.
- In `sendPreflightedMessageBusTransaction`, call `applyExternalSignatures` first and then judge every input on the
  signed bytes. In `submitFinalTransaction`, call `applyExternalSignatures` before the bytes are broadcast. The
  placeholder has the signature's size, so the fee does not change.

After the patch, on Chipnet: I'm still here
[`cf6ffd83…1c80`](https://chipnet.imaginary.cash/tx/cf6ffd83dc7fed321ed158ad40416dec90b2c176c6429233dab40b95e0381c80),
take back [`62dfa7e0…3d1a`](https://chipnet.imaginary.cash/tx/62dfa7e0e090357643fcf6e832bfdcbeb2669dd0360150cf46adaec711793d1a),
and a payout to 6 heirs paid by a stranger's wallet
[`187ac296…a90c`](https://chipnet.imaginary.cash/tx/187ac29671c0c75ff40fdf9ab0ceb421f3e08e53e9167173402b62290d13a90c).

**Suggested upstream fix.** Take the patch as a PR. One change worth making on the way: our patch spots the
placeholder by its bytes (a 65-byte push of zeros); upstream could mark it on the unlocker instead.

## 2. A payout loop cannot be combined with a time check

**What happened.** Two separate failures, both with a timestamp locktime on the call:

- When the SDK derives the outputs, any function that reads `tx.time` or `tx.locktime` and transfers fails with
  `VM failed at ip 14 opcode 82 (OP_VERIFY)`. Our guess, not checked: the derivation run does not use the call's
  locktime.
- With explicit `.transfer()` outputs, the preflight fails whenever the transfers come from a loop:
  `messageBus: BCH-2026 preflight failed at input 0: Program failed an OP_VERIFY operation`.

So a time-locked payout needs explicit outputs, and explicit outputs need unrolled transfers.

**Reproduction.** Two payees, mock network with the real 2026 limits:

```solidity
pragma solidcash ^0.50.0;

contract ReproLoop(int deadline) {
    bytes20[] public payees;

    constructor(bytes20[] initialPayees) {
        this.payees = initialPayees;
    }

    function payAll() public {                       // fails, derived or explicit outputs
        require(tx.time >= deadline);
        int each = (this.balance - 2000) / int(this.payees.length);
        for (int i = 0; i < int(this.payees.length); i++) {
            this.transfer(new LockingBytecodeP2PKH(this.payees[i]), each);
        }
    }

    function payTwoUnrolled() public {               // works only with explicit outputs
        require(tx.time >= deadline);
        int each = (this.balance - 2000) / 2;
        this.transfer(new LockingBytecodeP2PKH(this.payees[0]), each);
        this.transfer(new LockingBytecodeP2PKH(this.payees[1]), each);
    }
}
```

Call each with `.setLocktime(t)` (with `t` just below the mock's latest time), once letting the SDK derive the
outputs and once with `.transfer(lock, each)` per payee:

| Function body | Outputs | Result |
|---|---|---|
| loop of `this.transfer`, no time check | derived | OK |
| same, with `.setLocktime(t)` on the call | derived | OK |
| same | explicit | preflight failure (`OP_VERIFY`) |
| `require(tx.time >= deadline)` + loop | derived | `VM failed at ip 14` |
| `require(tx.time >= deadline)` + loop | explicit | preflight failure |
| `require(tx.time >= deadline)` after the loop | derived | `VM failed at ip 14` |
| `require(tx.locktime >= deadline)` + loop | derived | `VM failed at ip 14` |
| `require(tx.time >= deadline)` + two unrolled transfers | derived | `VM failed at ip 14` |
| `require(tx.time >= deadline)` + two unrolled transfers | explicit | OK |

The contract above and the nine cases in the table are the complete reproduction.

**Impact.** Any contract that pays a list of people after a date: wills, vesting, payroll, escrow with many parties.
Pusaka uses ten guarded slots (`if (i < len) this.transfer(...)`) and caps heirs at 10.

**Suggested fix.** Use the call's locktime in the derivation run, and let the preflight accept transfers emitted
from a loop when the explicit outputs match. If loops are out of scope for now, a compiler error that names the
limit would save a day.

## 3. `npx solidhat test` on Windows passes without running any test

**What happened.** On Windows, `npx solidhat test` prints the compile lines and exits with code 0, without running
a single test. `npx vitest run -c vitest.solidhat.config.ts` runs them.

**Reproduction.** Any SolidHat TypeScript project on Windows 11 with Node 24.11; ours is [`contract/`](../contract/).

**Impact.** A green result with no tests behind it; a CI job on Windows would pass the same way. We noticed only
because the output had no test lines.

**Suggested fix.** Find why the test runner does not start on Windows (a path or spawn issue is our guess, not
checked). Until then, exit non-zero when no test file ran.

**Our workaround:** `"test": "solidhat compile && vitest run -c vitest.solidhat.config.ts"` in `package.json`.

## 4. Memory-aliasing error on a common Solidity struct pattern

**What happened.** The Monad project's `FaraidLib.sol` (230 lines of Solidity 0.8.24: structs, enums, custom errors,
exact fractions) compiles unchanged as a library, which was a good surprise. Calling `FaraidLib.compute()` from a
contract fails: "Memory alias group 'pool, factor' reaches an operation that cannot yet preserve Solidity aliasing".

**Reproduction** (`evmCompat: true`):

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

Passing a local `memory` struct into an internal function that returns a `memory` struct is enough; no reassignment
is needed. Passing only temporaries (`add(Frac(x, 2), Frac(1, 3))`) compiles.

**Impact.** Fraction and math libraries use this pattern everywhere, so it blocks a lot of EVM code from porting.
For us it blocked checking faraid on chain; the shares are computed in the browser instead.

**Suggested fix.** Copy the struct when aliasing cannot be proven safe for a `pure` function, or at least point the
error at the call site and suggest the temporary-only form.

## 5. The template's mock uses relaxed limits

**What happened.** The mock's default consensus limits are relaxed (1 MB inputs, 1 MB NFT commitments, no dust
check). The README says so, but the TypeScript template keeps the relaxed mock.

**Reproduction.** A new project from the TypeScript template: its `solidcash.config.ts` has no `consensus` block.

**Impact.** A new project's green tests say little about whether its transactions are valid on chain. Stateful
calls are large (ours are 9 to 12 KB), so the gap matters.

**Suggested fix.** Make the real limits the template default. Ours, with which all 58 of our tests pass:

```ts
mock: {
  type: 'mock',
  consensus: {
    maximumInputBytes: 10_000,
    maximumStackItemBytes: 10_000,
    maximumTransactionBytes: 1_000_000,
    maximumNftCommitmentBytes: 128,
  },
  policy: { enforceDust: true },
},
```

## 6. `initialState` is silently ignored for a dynamic struct array

**What happened.** `initialState: { heirs: [...] }` for a `Heir[]` state variable is ignored with no message; the
state comes back as `[]`. Passing the array through a `constructor(Heir[] initialHeirs)` works.

**Reproduction.** Deploy `Pusaka` with `initialState: { heirs: [...] }` instead of the constructor argument, then
read `getState()`.

**Impact.** Wrong state with no error. We lost time before trying the constructor.

**Suggested fix.** Support it, or throw an error that names the field and suggests the constructor.

## 7. Re-attaching to a deployed stateful contract is undocumented

**What happened.** An app that reloads a plan from a saved link must rebuild the contract object.
`ContractFactory.attach(category)` alone fails with "Expected 4 arguments". What works:

```ts
new StatefulContract(new Contract(artifact, [ownerPkh, period, total, feeBudget], { provider }), categoryId)
```

The category is not the genesis txid but the txid of the coin the genesis spends first (`deployed.categoryId`).
Passing the genesis txid gives "Expected 1 data NFT(s) ... found 0".

**Reproduction.** Deploy any stateful contract with constructor arguments, then attach with the genesis txid.

**Impact.** Every app that reloads a contract after a page reload or on another device.

**Suggested fix.** `attach(category, constructorArgs)` on the factory, a docs page on re-attaching, and an error that
says "this looks like a genesis txid; pass the category id".

## 8. A stateful call wants 11 separate coins from the caller

**What happened.** `distribute` (about 12 KB, 16 inputs) asks for 11 separate plain coins from the caller. With
none, it fails with `Signer has 0 available plain UTXO(s) but 11 funder(s) needed`. A wallet holding one coin is
first asked to sign a split into 11. The SDK also swept several of the caller's small change coins into the payout.

**Reproduction.** Call `distribute` on a 6-heir `Pusaka` from a wallet that holds one coin.

**Impact.** A visitor pressing "Send to heirs" signs twice, and pays for more inputs than needed.

**Suggested fix.** Can the funder count be lower? If not, document why, and expose the count before the call so an
app can prepare the coins in one step.

## 9. No helper for the network's time on a live network

**What happened.** A timestamp locktime is final only below the median time past of the last 11 blocks. SolidHat
scripts have no `time.latest()` on a live network, so our script reads the last 11 block headers over Electrum
(`blockchain.block.header`) and takes the median. Chipnet's median time past was 4,449 seconds (about 74 minutes)
behind the clock on 15 Nov.

**Reproduction.** Call any function guarded by `tx.time` with `setLocktime(Date.now() / 1000)` on Chipnet: the node
refuses the transaction as not final.

**Impact.** Every contract that uses `tx.time`. Without the helper, calls fail, or deadlines land an hour off.

**Suggested fix.** `provider.getMedianTimePast()` in the SDK, and a docs line next to `tx.time` about the lag.

## 10. An early time-locked call shows the locktime error, not the contract's

**What happened.** A `distribute` before the deadline fails with the CLTV locktime message, not the contract's
custom error or `require` message, because the transaction's locktime check fails first.

**Reproduction.** Test `nobody can distribute before the deadline` in
[`contract/test/Pusaka.test.ts`](../contract/test/Pusaka.test.ts); it can only assert that the call fails.

**Impact.** Developers and users see a consensus message instead of the reason they wrote.

**Suggested fix.** When a call fails on locktime, say which `tx.time` or `tx.locktime` check it relates to.

## 11. `solidhat compile` silently skips subfolders of `contracts/`

**What happened.** Only `.scash` files directly inside `contracts/` are compiled. A file in `contracts/repro/` was
skipped with no message, and the test then failed with "no SolidCash artifact named ...". We did not check whether a
config option exists.

**Impact.** Hardhat compiles subfolders, so ported projects expect it.

**Suggested fix.** Compile subfolders, or warn about `.scash` files that were skipped.

## 12. `bytes.length` is `uint256` under `evmCompat`

**What happened.** Porting our CashScript prototype needed one change besides the pragma: with `evmCompat: true`
(the template default), `int n = heirs.length / 24;` fails with "Type 'uint256' can not be assigned to variable of
type 'int256'". The fix is `int n = int(heirs.length) / 24;`.

**Impact.** Not a bug, but it is the first error most CashScript users will hit when porting.

**Suggested fix.** Suggest the cast in the error message.

## 13. Noisy messages

- `STB debug() best-effort error: Cannot debug a transaction with custom unlocker` is printed on every
  wallet-signed call. It is harmless but reads like a failure. Suggest printing it only in debug mode.
- `tx.origin` gives a warning recommending `checkSig`. For our one `require` (line 28, inside a `modifier` used by
  two functions) `solidhat compile` printed it four times. Suggest one warning per source location, and a docs note
  on when co-spending an owner coin is the right pattern: it lets any wallet authorise a call by signing only its
  own ordinary coin.

## 14. Smaller gaps

- `ElectrumNetworkProvider` has no `getBalance`; we sum `getUtxos(address)`.
- `Signer.external` names one address, while WizardConnect is an HD session (xpubs) whose wallets move change to new
  addresses. A contract that checks the owner's address then needs the app to gather the coins there first. Support
  for an HD signer (WizardConnect's `inputPaths`) would remove that step.
- The GitHub `master` branch reports `0.14.0-beta.1` in its `package.json` files while npm has 0.50.x (published
  7 Nov), so the docs in the repo may describe an older release.
- `npm create @solidcash/solidhat@0.50.0 contract` fails on Windows with `ECOMPROMISED: Lock compromised`. The error
  comes from npm's own `npm exec` lock (`libnpmexec/lib/with-lock.js`, npm 11.6.2), not from SolidHat. Workaround:
  install `@solidcash/create-solidhat` into a scratch folder and run its `dist/cli.js` with `--template typescript
  --package-manager npm --yes`. A line in the README would help Windows users.
- The TypeScript template's sample test only checks that a factory loads. A sample that sends a transaction and
  asserts a rejection would show new users the testing loop.
- For CashScript users: `MockNetworkProvider` moved to `@solidcash/solidcash/network/mock`, and `addUtxo` is now
  async. Worth a line in a migration note.

## Q. Four 1,000-sat outputs locked with `OP_1` in each payout

A question, not a report. Both of our `distribute` transactions on Chipnet
([`d76ffee1…25ad`](https://chipnet.imaginary.cash/tx/d76ffee1296a7d11cc94719e696ed57cdd8781a1389f7fda71eaa66ad48e25ad)
and [`187ac296…a90c`](https://chipnet.imaginary.cash/tx/187ac29671c0c75ff40fdf9ab0ceb421f3e08e53e9167173402b62290d13a90c))
have four outputs (#9 to #12) of 1,000 sats each whose locking bytecode is a single `OP_1`. Our `checkIn`
transaction has none. A locking script of `OP_1` can be spent by anyone. Are these intended (for example, swept by
a later step), and could the docs say what they are for?

## What worked well

- The Solidity features we wanted all compiled: a `struct`, a struct array in state, a `modifier`, events, a custom
  `error` and the satoshi container (`this.balance`, `this.transfer`).
- The prototype compiled after one cast, and `FaraidLib.sol` compiled unchanged as a library.
- The SDK is close to CashScript (`Contract`, `TransactionBuilder`, `SignatureTemplate`, `randomUtxo`).
- The mock enforces BIP68 relative locktimes, which CashScript's mock did not. It caught a test of ours that had
  passed for a coin that was not old enough.
- The stateful contract ran its whole lifecycle on Chipnet with no change.
