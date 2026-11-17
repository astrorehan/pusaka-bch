# Pusaka v2 Stage 1 Proof Record — Usable Protected BCH Balance & Safe Receive Inbox

Date: 17 November 2026
Status: Stage 1 executable proof implemented and verified locally (`4/4` tests under BCH 2026 mock VM consensus/dust rules + strict `Signer.external` stand-in) and on live Chipnet (`deploy -> deposit 1 -> self-sweep 1 -> send 1 -> deposit 2 -> fresh-session JSON attach -> self-sweep 2 -> send 2`). Local `bitcoind` regtest, real Paytaca mobile approval, and mainnet remain explicit open gates.

---

## 1. Construction Summary

Stage 1 proves the usable inheritance-aware BCH balance and safe ordinary receive path required by [inheritance-wallet.md](../architecture/inheritance-wallet.md) Gate A and [DELIVERY.md](../DELIVERY.md) Stage 1.

### Contracts
1. [`WalletBalanceProof.scash`](../../contract/contracts/WalletBalanceProof.scash) — Stateful v2 balance proof covenant (`8,698 B` compiled debug bytecode vs `8,347 B` for v1 `Pusaka.scash`, P2SH32):
   - Constructor parameters: `(bytes20 ownerPkh, int period, int totalShares, int feeBudget)` plus initial mutable state `(int firstDeadline, Heir[] initialHeirs)` (`1` to `10` heirs).
   - `ownerCoSpends` modifier: requires `tx.origin == new LockingBytecodeP2PKH(ownerPkh)` (matching v1 owner-coin co-spend authorization so standard P2PKH wallet signing works).
   - `send(bytes recipientLock, int amount)` (`ownerCoSpends`):
     - Enforces `tx.locktime >= 500000000` (timestamp locktime) and non-shrinking `deadline` update (`nextDeadline = tx.locktime + period; if (nextDeadline > this.deadline) this.deadline = nextDeadline`).
     - Enforces `amount >= 546`, `this.balance >= amount`, `remaining == 0 || remaining >= 576` (container dust), and valid recipient locking script length (`25` P2PKH, `23` P2SH20, or `35` P2SH32).
     - Emits NO event (omitting a `Sent` log keeps `neededFunders = 1` instead of `2` and avoids pushing `send()` over BCH 2026 `10,000 B` script limits).
     - Executes `this.transfer(recipientLock, amount)`, returning any `remaining >= 576` sats into the authenticated `satoshiContainer` in the same transaction.
   - `checkIn()`, `withdraw()`, and `distribute()`: preserve v1 manual fallback check-in, full owner withdrawal, and permissionless multi-heir distribution after `tx.time >= this.deadline`.

2. [`WalletBalanceInbox.scash`](../../contract/contracts/WalletBalanceInbox.scash) — Permissionless receive/inbox covenant (`261 B` compiled debug bytecode, P2SH32):
   - Constructor parameters: `(bytes35 satoshiContainerLock, int perInputFeeCap)` (default `perInputFeeCap = 600` sats).
   - `sweepToContainer()`:
     - Requires `tx.outputs[0].lockingBytecode == satoshiContainerLock`, `tx.outputs[0].tokenCategory == 0x`, and `tx.outputs[0].value >= 576`.
     - Scans all inputs, summing tokenless inputs matching `satoshiContainerLock` (`containerInputs <= 1`) and `myLock` (`inboxInputs >= 1`), rejecting any token-carrying input at either role.
     - **Self-funded mode** (`tx.outputs.length == 1`): allows `feeAllowance = 400 + inboxInputs * perInputFeeCap` from the swept amount so anyone (including heirs or a relayer without owner keys) can consolidate inbox receipts into `satoshiContainer` even when the owner is dead or unresponsive, or when `container` was previously emptied to `0` (`initialBalance = 0` or post-`withdraw()`).
     - **Sponsored mode** (`tx.outputs.length > 1`): requires `tx.outputs[0].value >= protectedIn`, forcing 100% of swept inbox + container satoshis into `satoshiContainer` while the sponsor pays the full miner fee and takes ordinary change.
   - Never touches the Plan master NFT and therefore **cannot advance `deadline`** or renew proof of life.

### Why Separate Receive Inbox + Category-Pinned `satoshiContainer`
- In SolidCash `0.50.1`, a newly attached `sc.getAddress()` (`masterAddress`) holds the state NFT and cannot directly act as an ordinary plain-BCH receive address without stranding funds outside `this.balance` (`satoshiContainer`).
- Every plan's `satoshiContainerLock` (`35`-byte P2SH32) embeds the unique `categoryId` minting NFT and the master covenant lock via `buildSatoshiContainerCovenantScript(...)`:
  - `flag = 1`: master-authorized spend (`send`, `withdraw`, `distribute`) requires co-spending the authentic `minting` NFT of `categoryId` at `masterLock`. Forged categories or `mutable` NFTs fail VM verification.
  - `flag = 0`: permissionless UTXO merge into output `mergeOutputIndex` (`0`) lets `sweepToContainer()` combine an existing container UTXO (or initialize from `0` UTXOs) with one or more pending `WalletBalanceInbox` UTXOs without owner signatures.

---

## 2. Critical SDK & Chipnet Findings (Isolated Without Patching `node_modules`)

Inspection of `@solidcash/solidcash@0.50.1` and live Chipnet runs surfaced five concrete behaviors isolated in [`wallet-balance-helper.ts`](../../contract/scripts/v2/wallet-balance-helper.ts):

1. **Fresh-session P2SH32 lock reconstruction (`attachWalletBalancePlan`)**:
   - `ContractFactory.deploy()` pins the master contract's P2SH32 lock to its allocated `categoryId`. Reconstructing with `StatefulContract.from(artifact, constructorArgs, options)` without passing `metadata.categoryId` as the 4th argument derives an un-pinned P2SH32 lock that mismatches the live plan.
   - `attachWalletBalancePlan` passes `metadata.categoryId` to `StatefulContract.from(...)` and fails closed if derived `masterLockHex`, `satoshiContainerAddress`, or `inboxAddress` differs from metadata.

2. **Explicit `.transfer()` alongside `.setLocktime()` in `sendProtected`**:
   - SolidCash `0.50.1` `CallBuilder` auto-transfer derivation fails when `.setLocktime()` is combined with runtime-forwarded `this.transfer(recipientLock, amount)`. Calling `.call.send(recipientLock, amount).transfer(recipientLock, amount).setLocktime(locktime).send()` preserves full on-chain contract validation and avoids the probe failure.

3. **`flag = 0` merge unlocker (`createSatoshiContainerMergeUnlocker`)**:
   - SolidCash exports `createSatoshiContainerUnlocker(..., flag=1)` for master-authorized spends, but does not expose a helper for the `flag = 0` permissionless merge arm already compiled into `buildSatoshiContainerCovenantScript`. `createSatoshiContainerMergeUnlocker` constructs that `flag = 0, mergeOutputIndex = 0n` unlocker directly via `createCovenantContractUnlocker`.

4. **Live Chipnet `orderPlain` UTXO-selection bug (`withFundedPlainUtxoPreference`)**:
   - **Observed failure**: On live Chipnet after Deploy + Send 1, the owner address held three plain UTXOs (`9,408` sats, `341,572` sats, and `9,982` sats). SolidCash's `orderPlain` sorts funder coins solely by `(a.vout === 0) - (b.vout === 0)` without checking satoshi values. On `Send 2`, SolidCash picked the stale `9,408`-sat UTXO instead of `341,572` sats, and the Chipnet node rejected the broadcast:
     `Transaction fee of 9408 satoshis is below the minimum relay fee (9801 satoshis for a 9801-byte transaction at 1.0 sat/byte)`.
   - **Isolated fix**: `withFundedPlainUtxoPreference(signer, minSats = 11_000n)` wraps `signer` via `Object.create(signer)` (preserving `instanceof Signer` and signing delegation) and overrides `getUtxos()` to sort plain UTXOs descending and exclude plain coins `< 11,000n` whenever at least one plain coin `>= 11,000n` exists. `sendProtected` applies this wrapper automatically; verified both in Mocknet regression (with a `9,000`-sat `vout: 1` coin present) and on a clean full Chipnet run.

5. **Exact full-drain (`remaining == 0`) slot-preserving carrier**:
   - On partial sends (`remaining >= 576`), `ownerNetSpent === feePaid` (`0` sats skimmed or trapped).
   - When draining 100% of the protected balance (`remaining == 0`), SolidCash emits a `576`-sat `fillerOutput()` at the `satoshiContainer` block slot to preserve `blockLayout` output indices. That `576`-sat carrier is funded from the owner's P2PKH input (`ownerNetSpent === feePaid + 576n`) and remains spendable only via future container slots or exit; subsequent inbox deposits still sweep cleanly into a new container UTXO.

### WizardConnect `(receive, 0)` Wallet Caveat
- [`wizard.ts`](../../app/src/lib/chain/wizard.ts) binds `ownerAddress()` to HD path `(receive, 0)`. `WalletBalanceProof` checks `tx.origin == new LockingBytecodeP2PKH(ownerPkh)` against that `(receive, 0)` hash, and `Signer.external` routes P2PKH change back to `ownerAddress()`.
- Provided external wallet usage leaves at least one funded fee UTXO at `(receive, 0)` (not swept onto a different HD change index by another wallet screen), repeated `send()` calls keep working without an interactive second top-up. Real Paytaca mobile signing of v2 `send()` remains an explicit open gate (Stages 4/6).

---

## 3. Stage 3 Integration Notes & Script-Size Headroom

For the Stage 3 (`PusakaV2`) integrator:
- Reusable Stage 1 API in [`contract/scripts/v2/wallet-balance-helper.ts`](../../contract/scripts/v2/wallet-balance-helper.ts):
  - `deployWalletBalancePlan`, `attachWalletBalancePlan`, `inspectWalletBalancePlan`
  - `sweepInbox` (`auto` / `self` / `sponsored`), `sendProtected`
  - `deriveSatoshiContainerLock`, `createSatoshiContainerMergeUnlocker`, `withFundedPlainUtxoPreference`
  - `inspectTransactionAccounting` (`usedDummyFunder` detection ensuring no synthetic `OP_TRUE` MockNetworkProvider funders sneak into accounting proofs)
- **Critical 10 KB input/tx headroom finding**:
  - `WalletBalanceProof.scash` compiles to `8,698 B`, and each `send()` transaction measures `9,835–9,836 B` on-chain/mocknet with ~`9,500+` B concentrated in the stateful input's unlocking/redeem script area (only `~164 B` below BCH 2026 `maximumInputBytes: 10,000` / `maximumStackItemBytes: 10,000` configured in [`solidcash.config.ts`](../../contract/solidcash.config.ts)).
  - Stage 3 **cannot** stack 2-of-3 contact quorum state, inactivity-review entry, and `ClaimReviewAnchor` handling directly on top of the full 10-heir unrolled `WalletBalanceProof` stateful contract without exceeding the `10,000 B` input limit unless the policy/claim logic is refactored (e.g., compact loop / split companion covenants / `Contract` + `TransactionBuilder` architecture as used in Stage 2's `ClaimReviewProof` + `ClaimReviewAnchor`).

---

## 4. Measured Transaction Sizes, Fees & ~99% Protected Accounting

### Stage 1 Flow Telemetry (Mocknet VM & Live Chipnet)

| Operation | Mocknet Size (B) | Mocknet Fee (sats) | Live Chipnet Size (B) | Live Chipnet Fee (sats) | Protected Balance Effect |
|---|---:|---:|---:|---:|---|
| Deploy (`initialBalance = 0`) | 908 | 1,908 | 908 | ~1,908 | `0` in container; `1,000` master + `1,000` data NFT |
| Ordinary deposit -> `inboxAddress` | ~229 | 500 | 229 | 400 | Added to `inboxAddress` (no `deadline` change) |
| Permissionless self-sweep #1 (1 in) | 400 | 415 | 400 | 415 | `15,000 -> 14,585` (Chipnet) / `400,000 -> 399,585` (Mocknet) |
| Partial `send` #1 (`ownerExternal`) | 9,836 | 10,019 | 9,835 | 10,018 | Exact `-amount`; `deadline = locktime + period` |
| Sponsored 2-input sweep #2 | 1,200 | 1,215 | — | — | `100%` of container + both inbox UTXOs preserved |
| Self 2-input merge sweep #2 (1 cont + 1 inbox) | — | — | 679 | 694 | `8,585 + 8,000 - 694 = 15,891` |
| Partial `send` #2 (after fresh JSON attach) | 9,836 | 10,019 | 9,835 | 10,018 | Exact `-amount`; `deadline` advances again |

### ~99.1% Protected Owner-Coin Accounting (`WalletBalance.test.ts`, Test 2)
Initial state: `5,000,000` sats protected in `satoshiContainer` (`99.108%` of owner funds); owner holds **one single `45,000`-sat P2PKH fee coin** (`0.892%` unprotected, zero top-ups, `usedDummyFunder: false`).

| Step | Protected Before (sats) | Sent (sats) | Protected After (sats) | Tx Size (B) | Miner Fee (sats) | Owner Input (sats) | Owner Change (sats) | Net Owner Spent (sats) | Accounting |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Send #1 (partial) | 5,000,000 | 50,000 | 4,950,000 | 9,836 | 10,026 | 45,000 | 34,974 | 10,026 | Exact `feePaid` |
| Send #2 (partial) | 4,950,000 | 50,000 | 4,900,000 | 9,836 | 10,026 | 34,974 | 24,948 | 10,026 | Exact `feePaid` |
| Send #3 (partial) | 4,900,000 | 50,000 | 4,850,000 | 9,836 | 10,026 | 24,948 | 14,922 | 10,026 | Exact `feePaid` |
| Full drain (`remaining = 0`) | 4,850,000 | 4,850,000 | 0 | 9,836 | 10,026 | 14,922 | 4,320 | 10,602 | `feePaid + 576` slot filler |

Post-drain deposit (`75,000` sats -> `inboxAddress`) + self-sweep revived `satoshiContainer` cleanly from `0` to `74,585` sats (`415`-sat sweep fee).

---

## 5. Adversarial & Lifecycle Checks Covered

All 4 tests in [`WalletBalance.test.ts`](../../contract/test/v2/WalletBalance.test.ts) enforce `usedDummyFunder === false` and verify:
1. **End-to-end Stage 1 lifecycle & strict `Signer.external` stand-in**: empty deploy -> ordinary receipt -> permissionless self-sweep (`deadline` unchanged) -> partial `send` (`deadline` renewed) -> 2 concurrent inbox receipts -> sponsored merge sweep -> repeat `send` -> fresh-session JSON attach -> third `send` -> stale `9,000`-sat `vout: 1` UTXO regression (`withFundedPlainUtxoPreference`) -> stranger `send` hijack rejection. Every external signing request is audited to have `unlockingBytecode.length === 0` on all inputs and signs **only** the owner's P2PKH input.
2. **~99.1% protected balance accounting**: 3 consecutive sends from a lone `45,000`-sat fee coin + full drain (`remaining = 0`) + post-drain inbox revival.
3. **Permissionless inheritance path without owner help**:
   - Deposit arriving during inactivity (`28d`) sweeps permissionlessly without advancing `deadline`; pre-deadline `distribute()` fails.
   - Late deposit arriving *after* `deadline` (owner absent) sweeps permissionlessly and is included in full 6-heir Faraid payout (`pot1`).
   - Late deposit arriving *after* `distribute()` (`60,000` sats) sweeps into remainder and pays all 6 heirs (`pot2`).
   - Late deposit arriving *after* `withdraw()` empties container to `0` (`40,000` sats) sweeps into container and remains claimable by heirs (`pot3`).
4. **Adversarial & boundary rejections**:
   - Tampered metadata (`inboxAddress` mismatch) rejected fail-closed at `attachWalletBalancePlan`.
   - Backdated `tx.locktime` (`500_000_001`) cannot shrink `deadline`.
   - Recipient dust (`545 < 546`), unsupported recipient script (`0x51`), remaining container dust (`500 < 576` with/without explicit `.setState`), and recipient substitution (`send(payer, ...)` paying `attacker`) all revert.
   - Forged `minting` NFT (`categoryId` mismatch) and same-category `mutable` NFT fail `flag = 1` `satoshiContainer` unlock.
   - Inbox output diversion away from `satoshiContainerLock`, 1-sat sponsored-sweep skimming, self-sweep fee exceeding `400 + inboxInputs * 600` (`-1001` sats), double container merge (`2` container inputs), and token-carrying junk UTXOs at `inboxAddress` (both builder-level `Implicit burning of fungible tokens` and VM-level `allowImplicitFungibleTokenBurn: true` -> `input index 0` revert) are rejected while legitimate BCH at `inboxAddress` still sweeps cleanly alongside stuck token junk.

---

## 6. Verification Evidence by Proof Level

| Proof Level | Status | Command & Exact Evidence |
|---|---|---|
| **Compiler (`solidc 0.50.0` / `solidhat`)** | Passed | `npx solidhat compile` -> `Compiled 7/7 file(s), 7 contract artifact(s)` (`WalletBalanceProof.scash`: `8,698 B` debug bytecode; `WalletBalanceInbox.scash`: `261 B` debug bytecode). |
| **Baseline regressions** | Passed | `npx vitest run -c vitest.solidhat.config.ts test/Pusaka.test.ts` -> `11/11` passed.<br>`node --test app/scripts/wizard-signing.test.mjs` -> `3/3` passed. |
| **VM / Mock (`BCH_2026_05` + dust + strict `Signer.external` stand-in)** | Passed (4/4) | `npx vitest run -c vitest.solidhat.config.ts test/v2/WalletBalance.test.ts` -> `Test Files 1 passed (1)`, `Tests 4 passed (4)` in `150.42s`. Zero synthetic dummy funders (`usedDummyFunder: false`). |
| **Local BCH node / regtest** | Not run (open gate) | `bitcoind` / `bitcoin-cli` not installed in environment; Docker daemon unavailable. |
| **Live Chipnet (`ElectrumNetworkProvider('chipnet')` + strict `Signer.external`)** | Passed (Stage 1 flow) | Command: `$env:RUN_CHIPNET_TX="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/wallet-balance-chipnet.ts --network chipnet`<br>Category: `0a7b2edc3aa137bc8caaa2db95ca51d170cac3335b45a99b5525deba11825603`<br>Inbox: `bchtest:pd3judfrvlruv96d9rvazqyau93qnl4f70yac63yuyrwgvmldfwh6sp5vza40`<br>- Deploy (`908 B`): `145623ac8e21af1144b453c663ffed2718d53dd195b11395ce5619d7bfa38bbb`<br>- Deposit 1 (`15,000` sats, `229 B`): `dd1426780ee7c08f0488c4321ab9acb219d58999ab3ca29e8480c3138f78cbb5`<br>- Self-sweep 1 (`400 B`, `415` fee -> `14,585` sats): `a31948494e75a76513f2f022da6a3fac02d44207efe1059fda122d6788ccaf65`<br>- Partial send 1 (`6,000` sats, `9,835 B`, `10,018` fee -> `8,585` sats, `deadline: 1797512825`): `c60410f9ba7e6707d02e687911ee5f2bb3d81de1622d9b41392f536db4785654`<br>- Deposit 2 (`8,000` sats, `229 B`): `b3090618064f70bb1ef5443978e7fa381e2dd406c80ad7888e40d35958f72a44`<br>- Fresh-session attach -> Self-sweep 2 (`679 B`, `694` fee -> `15,891` sats): `e5305bd337afd0fa80aefa25bf0bb207feec891be0f85a522631ca1ed4281177`<br>- Partial send 2 (`5,000` sats, `9,835 B`, `10,018` fee -> `10,891` sats, `deadline: 1797512946`): `bc06535d220ca8ec411224ee045b0be4176712087336871345ef97ea95ac5d7d`<br>- Balance deltas: owner `360,962 -> 331,262` sats, payer `105,642 -> 92,842` sats.<br>**Note**: Live Chipnet `distribute()` after deadline expiry was not waited out (`PERIOD = 30d`); covered in Mocknet VM (Test 3). |
| **Real Paytaca mobile signing** | Not run (open gate) | Strict `Signer.external` stand-in verified offline and on Chipnet; live Paytaca mobile app approval of v2 `send()` and `(receive, 0)` coin behavior remain deferred to Stages 4/6. |
| **Mainnet** | Untouched | No mainnet transactions or funds used; existing v1 mainnet plan intact. |
