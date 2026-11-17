# Pusaka v2 Stage 2 Proof Record — Anchored Claim Review Clock

Date: 17 November 2026
Status: Stage 2 executable proof implemented and locally verified (11 tests).
The initial construction's live Chipnet pre-maturity lifecycle and
`non-BIP68-final` rejection were verified. The fee-reserve hardening below has
only been reverified locally. Live Chipnet post-MTP-maturity finalize, local
`bitcoind` regtest, and live Paytaca mobile signing remain explicit open gates.

---

## 1. Construction Summary

Stage 2 isolates and proves the consensus-anchored claim review delay required by [inheritance-wallet.md](../architecture/inheritance-wallet.md) Gate B and [DELIVERY.md](../DELIVERY.md) Stage 2.

### Contracts
1. [`ClaimReviewAnchor.scash`](../../contract/contracts/ClaimReviewAnchor.scash) — Dedicated immutable-NFT anchor covenant (`~108 B` compiled bytecode, P2SH32):
   - Constructor parameters: `(bytes32 planCategory, bytes20 ownerPkh, int reviewSequence)`
   - `finalize()`: requires `activeInputIndex == 1`, `tx.inputs[0].tokenCategory == planCategory + 0x02` (co-spends the unique authenticated Plan master NFT), `tx.inputs[1].tokenCategory == planCategory` (`none`-capability NFT), `4194305 <= reviewSequence <= 4259839` (valid non-disabled time-based BIP68 range), `tx.version >= 2`, and `require(this.age >= reviewSequence)` (`OP_CHECKSEQUENCEVERIFY`).
   - `cancel()`: requires `activeInputIndex == 1`, `tx.inputs[0].tokenCategory == planCategory + 0x02`, `tx.inputs[1].tokenCategory == planCategory`, owner P2PKH co-spend at `tx.inputs[2]`, and output 0 returning the Plan minting NFT to the Plan locking bytecode. No sequence delay is imposed so the owner can cancel immediately.

2. [`ClaimReviewProof.scash`](../../contract/contracts/ClaimReviewProof.scash) — Plan state covenant (`~825 B` compiled bytecode, P2SH32):
   - Constructor parameters: `(bytes32 planCategory, bytes20 ownerPkh, bytes20 heirPkh, int reviewSequence, bytes anchorLockingBytecode, int minAnchorSats, int feeBudget)`
   - State is stored in the single `minting` NFT (`planCategory || 0x02`) commitment (6 bytes):
     - Byte `0`: `0x02` (v2 policy version)
     - Byte `1`: `status` (`0x00` = `ACTIVE`, `0x01` = `REVIEW`)
     - Bytes `2..5`: 4-byte little-endian `round` (`0` at genesis; incremented on each `openClaim`)
   - Methods:
     - `deposit()`: permitted in both `ACTIVE` and `REVIEW`; adds plain BCH into output 0 while enforcing unchanged `nftCommitment`, unchanged `minting` NFT, `tx.inputs[1].tokenCategory == 0x`, and no interaction with `ClaimReviewAnchor`.
     - `openClaim()`: permitted only from `ACTIVE`; advances `round + 1`, transitions Plan to `REVIEW`, and mints exactly one `none`-capability NFT of `planCategory` locked to `anchorLockingBytecode` with `nftCommitment = toPaddedBytes(newRound, 4)` (`>= minAnchorSats`). Supports either sponsored input 1 (`tx.outputs[0].value >= tx.inputs[0].value`) or self-funded single-input (`>= input0 - minAnchorSats - feeBudget`).
     - `cancelClaim()`: permitted only from `REVIEW`; requires Plan (input 0), matching Anchor (input 1, exact `roundBytes`), and owner P2PKH input 2; burns the Anchor NFT, restores `ACTIVE` preserving `roundBytes`, and protects Plan value.
     - `ownerWithdraw()`: permitted only from `ACTIVE` with owner P2PKH input 1; burns `minting` NFT and returns full balance to `ownerPkh`.
     - `finalizeClaim()`: permitted only from `REVIEW` with `tx.version >= 2`; consumes Plan (input 0) + exact matching Anchor (input 1, verified by `anchorLockingBytecode`, `planCategory`, and `roundBytes`), burns both NFTs, and enforces payout to `heirPkh` at output 0. Supports self-funded payout (`>= vaultTotal - feeBudget`) or relayer-sponsored fee at input 2 (`>= vaultTotal`).

### Why `Contract` + `TransactionBuilder` instead of `StatefulContract`
Inspection of installed `@solidcash/solidcash@0.50.1` (`StatefulContract.d.ts`, `TransactionBuilder.js`, `stateful/*.js`) established:
- `StatefulContract` `CallBuilder` exposes `setLocktime(n)` and `addInput(utxo, unlocker)` without `InputOptions.sequence`.
- `TransactionBuilder` directly exposes `addInput(utxo, unlocker, { sequence })` (`InputOptions.sequence`), preserves `version: 2`, supports `allowImplicitNftBurn`, and generates `WcTransactionObject` for WizardConnect.
- Isolating the review clock into a separate `ClaimReviewAnchor` UTXO ensures ordinary deposits (`deposit()`) and repeated trigger attempts cannot recreate the anchor UTXO or restart its chain age.

### Breaking Mutual Hash Dependency
Passing `planLockingBytecode` into `ClaimReviewAnchor` and `anchorLockingBytecode` into `ClaimReviewProof` would create a hash cycle. Instead, `ClaimReviewAnchor` binds `(planCategory, ownerPkh, reviewSequence)` without knowing `planLockingBytecode`, and enforces `tx.inputs[0].tokenCategory == planCategory + 0x02`. Because only one `minting` NFT of `planCategory` is ever created and `ClaimReviewProof` never lets it leave `planLockingBytecode`, `tx.inputs[0]` is unforgeably bound to `ClaimReviewProof`.

---

## 2. BIP68 Time Encoding & Network-Time Semantics

Helper API in [`claim-review.ts`](../../contract/scripts/v2/claim-review.ts):
- `encodeReviewDurationToBip68Sequence(durationSeconds)`:
  - `units = Math.ceil(durationSeconds / 512)` (rounded upward so actual lock is never shorter than requested)
  - Enforces `1 <= units <= 65535` (`0x00400001 .. 0x0040ffff`, or `512s .. 33,553,920s` ≈ `388.355` days)
  - Sets `BIP68_TIME_FLAG` (`0x00400000`) and leaves `BIP68_DISABLE_FLAG` (`0x80000000`) clear
- Timing configurations remain explicitly separated:
  - **Test configuration**: `512s` (`1` unit, `0x00400001`) or `600s` -> `1024s` (`2` units, `0x00400002`)
  - **Production policy example (72h)**: `259,200s` -> `507` units = `259,584s` (`0x004001fb`, 72h 6m 24s)
- **Network-time approximation**: BIP68 measures `spendMTP - prevMTP`, where `prevMTP = MTP(anchorConfirmationHeight - 1)` and `spendMTP` is the tip's 11-block Median Time Past (typically ~55 minutes behind wall-clock time on 10-minute BCH blocks). Finalization also requires the Anchor UTXO to have at least 1 confirmation (mempool UTXOs fail `non-BIP68-final`).

---

## 3. Critical Test-Provider Finding (`MockNetworkProvider` BIP68 Gap)

Inspection of installed dependencies revealed two simulator behaviors that would produce false-green relative time-lock tests if relied upon directly:
1. `contract/node_modules/@mem-cash/core/dist/node.js` (`utxoToSourceOutput`, lines 419–443) populates `so.height = utxo.height` but **never sets `so.medianTimePast`**. In `contract/node_modules/@mem-cash/validation/dist/checks.js:118`, `checkSequenceLocks()` falls back to `prevMtp = input.medianTimePast ?? 0`, so `spendMtp - 0 >= requiredTime` passes immediately for 0-second-old and unconfirmed UTXOs.
2. `MockNetworkProvider.keepSyntheticTimeWindow()` rewrites the timestamps of the last 11 block headers to `tip.timestamp` on every `sendRawTransaction()` and `mine()`.

**Resolution (without patching `node_modules`)**: [`StrictBip68ChainVerifier`](../../contract/scripts/v2/claim-review-verifier.ts) wraps `MockNetworkProvider` with an immutable historical block timestamp ledger and evaluates every transaction against:
- `@bitauth/libauth` `createVirtualMachineBch2026(true)` (`BCH_2026_05` VM on every input),
- `@mem-cash/validation` `checkLocktimeFinality`, `checkSequenceLocks` (with true `prevMtp = MTP(height - 1)` and `prevMtp = spendMtp` for unconfirmed UTXOs), `checkDustOutputs`, and `checkMinRelayFee`.

A dedicated test in [`ClaimReviewProof.test.ts`](../../contract/test/v2/ClaimReviewProof.test.ts) explicitly proves raw `MockNetworkProvider` accepts a 0-second-old `finalizeClaim` while `StrictBip68ChainVerifier` rejects the identical transaction with `non-BIP68-final`.

---

## 4. Measured Transaction Sizes & Fees

| Operation | Live Chipnet Size (bytes) | Default Fee Used (sats) | Notes |
|---|---:|---:|---|
| Genesis plan mint | 270 | 600–800 | P2PKH input -> Plan P2SH32 `minting` NFT + change |
| `openClaim` (sponsored) | 1,143 | 1,500 | Plan + sponsor -> Plan (`REVIEW`) + Anchor (`none` NFT, 1,000 sats) + change |
| `deposit` during `REVIEW` | 1,060 | 1,500 | Plan + funder -> Plan (unchanged commitment) + change; Anchor untouched |
| `cancelClaim` | 1,268 | 1,800 | Plan + Anchor + Owner P2PKH -> Plan (`ACTIVE`, same `round`) + change; Anchor burned |
| `ownerWithdraw` | 975 | 1,500 | Plan (`ACTIVE`) + Owner P2PKH -> Owner P2PKH; `minting` NFT burned |
| `finalizeClaim` | ~1,100 | 1,600 | Plan + Anchor (+ optional relayer) -> `heirPkh`; both NFTs burned |

All transactions operate well within BCH 2026 consensus limits (`maximumInputBytes: 10,000`, `maximumNftCommitmentBytes: 128`, `maximumTransactionBytes: 1,000,000`) and enforce dust (`>= 600` sats) and `>= 1 sat/byte` relay fees.

---

## 5. Adversarial & Boundary Checks Covered

All 11 tests in [`ClaimReviewProof.test.ts`](../../contract/test/v2/ClaimReviewProof.test.ts) verify:
1. **BIP68 upward rounding & bounds**: `1s`/`512s -> 1 unit`, `513s`/`600s -> 2 units (1024s)`, `72h -> 507 units (259,584s)`; `<= 0` and `> 33,553,920s` rejected.
2. **Full lifecycle + deposit during `REVIEW`**: genesis -> `openClaim` -> `deposit()` during `REVIEW` (Anchor outpoint and age undisturbed, deposited sats included in final payout) -> full MTP delay -> relayer-paid `finalizeClaim` paying full balance to `heirPkh`; WizardConnect `generateWcTransactionObject()` verified.
3. **Raw mock gap vs strict BIP68 rejection**: proves raw `MockNetworkProvider` bypasses time-based CSV while `StrictBip68ChainVerifier` rejects `non-BIP68-final`.
4. **Backdated `openClaim` `tx.locktime` (`500_000_001`)**: ignored for review clock; immediate finalize, unconfirmed (`height = 0`) anchor, `delay - 1s` (`1023s < 1024s`), and 5-block median stagnation all fail `non-BIP68-final`; 6th block shifts 11-block MTP and succeeds.
5. **Transaction version & sequence manipulation**: `tx.version = 1`, disabled sequence (`0x80400002`), height-based sequence (`0x0000ffff`), too-short time sequence (`0x00400001 < 0x00400002`), and same-tx open+finalize all fail VM/consensus.
6. **Anchor substitution / cross-plan / payout hijacking / state tamper**: plain BCH at anchor address, Plan B's anchor used on Plan A, repeated `openClaim` while in `REVIEW`, `deposit()` attempting state revert, and payout redirected to stranger all fail.
7. **Owner cancellation & stale proof invalidation**: non-owner `cancelClaim` rejected; `ownerWithdraw` blocked during `REVIEW`; valid owner `cancelClaim` succeeds at 0s elapsed, burns Round-1 Anchor, stops a pre-built Round-1 `finalizeClaim` even after full delay, restarts fresh clock on Round 2, and permits subsequent `ownerWithdraw`.
8. **Genesis `vout == 0` pre-split (`ensureGenesisUtxo`)**: works when owner initially holds only `vout > 0` UTXOs.
9. **Self-funded mode & fee caps**: single-input `openClaim` and 2-input `finalizeClaim` succeed while `feeBudget + 1` deductions are rejected.
10. **Signed-byte boundary (`round = 127 -> 128 -> 129`), stale-round anchor mismatch, & standalone anchor spend**: verifies `int(bytes4)` / `toPaddedBytes(..., 4)` across `0x80` sign-bit boundary and rejects stale-round anchor pairing or spending `ClaimReviewAnchor` without the Plan `minting` NFT.
11. **Fee-reserve diversion**: a self-funded `openClaim` with an additional payment
    to its caller is rejected by the VM, even when the remaining miner fee meets
    relay policy. Only sponsored opening may produce ordinary sponsor change.

### Fee-reserve hardening

The initial self-funded opening allowed three outputs and bounded the reduction
in plan value. A caller could turn part of that permitted fee reduction into a
payment to themselves. The added regression reproduced this before the fix:
with a 5,000-satoshi budget, an unsigned caller could receive 2,000 satoshis while
leaving 3,000 as the actual miner fee. `openClaim` now requires exactly the plan
and anchor outputs when no sponsor input exists. The legitimate sponsored and
self-funded paths remain covered by the lifecycle tests.

After this change, `npx solidhat compile` compiled all seven contracts, and
`npx vitest run -c vitest.solidhat.config.ts test/v2/ClaimReviewProof.test.ts`
reported 11 passing tests. The Chipnet transactions and byte measurements below
refer to the construction before this additional output restriction; they do not
establish live verification of the revised artifact.

---

## 6. Stage 3 Integration Notes

For Stage 3 (`PusakaV2` integrator):
- Import sequence encoding, commitment codecs, contract instantiation, and tx builders from [`contract/scripts/v2/claim-review.ts`](../../contract/scripts/v2/claim-review.ts).
- Integrate **2-of-3 contact quorum** and **inactivity deadline** (`tx.time >= inactivityDeadline`) directly inside `ClaimReviewProof.openClaim()` without altering `ClaimReviewAnchor.scash`.
- If `PusakaV2` shares balance with Stage 1's `WalletBalanceProof` / `WalletBalanceInbox`, ensure incoming deposits during `REVIEW` either sweep into the Plan UTXO without touching `ClaimReviewAnchor` or are swept alongside `finalizeClaim()` to the heirs so no late funds are stranded.
- Notice `ClaimReviewProof.openClaim()` enforces `tx.inputs[0].tokenCategory == planCategory + 0x02` and `tx.outputs[1].tokenCategory == planCategory`; keep `planCategory` reversed to wire byte order (`categoryDisplayHexToVmBytes`) when passing constructor args.

---

## 7. Verification Evidence by Proof Level

| Proof Level | Status | Command & Exact Evidence |
|---|---|---|
| **Compiler (`solidc 0.50.0` / `solidhat`)** | Passed | `npx solidhat compile` -> `Compiled ClaimReviewAnchor.scash -> ClaimReviewAnchor`, `Compiled ClaimReviewProof.scash -> ClaimReviewProof` (0 errors, 0 warnings). |
| **VM / Mock (`MockNetworkProvider`) + Strict BIP68 (`BCH_2026_05` + `@mem-cash/validation`)** | Passed (11/11) | `npx vitest run -c vitest.solidhat.config.ts test/v2/ClaimReviewProof.test.ts` -> `Tests 11 passed (11)` after fee-reserve hardening. |
| **Local BCH node / regtest** | Not run (open gate) | `bitcoind` / `bitcoin-cli` not installed in environment; Docker daemon pipe unavailable. |
| **Live Chipnet (`ElectrumNetworkProvider('chipnet')`)** | Partially verified | Command: `$env:CLAIM_REVIEW_CHIPNET_BROADCAST="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/claim-review-chipnet-check.ts --network chipnet` (height `335330`):<br>- Pre-split `vout=0`: `69631d3770630231b56cb5c2c9400813e7bcc4e79f3b06fcb0de90f0ffbe96dc`<br>- Genesis (`270 B`): `506daf129310e853fdf6d5df8ab5a7a2779bb64caf23c0194eabe94890b2829e`<br>- `openClaim` (`1143 B`): `5fdc9a3b474725dd09b54ae0ccf0828a2f9a0c96eb4f2d3008e3d44389deb90b`<br>- `deposit` during `REVIEW` (`1060 B`): `639df035c596324c0b0df83301e6964278b2b75c9f150fb08c6dd6ba69f8af6f`<br>- Immediate `finalizeClaim`: **REJECTED by Chipnet node** (`the transaction was rejected by network rules. non-BIP68-final (code 64)`)<br>- `cancelClaim` (`1268 B`): `6dccb04c714c1bc7d9139302927732bd007f9ccac76b1b275311fab8b6b3ee30`<br>- `ownerWithdraw` (`975 B`): `626c1226f9943d41f825b194c115ae07e54bb04bf58371962f15502d565c33f0`<br>- Net test balance change: `387,144 -> 379,644` sats (`7,500` sats total fees across 6 txs)<br>**Open gate**: waiting 512s+ of real Chipnet block MTP (~6 blocks / ~1 hour) to execute mature `finalizeClaim` on live Chipnet. |
| **Real Paytaca mobile signing** | Not run (open gate) | `generateWcTransactionObject()` verified offline on `openClaim`; live Paytaca approval of v2 covenants deferred to Stages 4/6. |
| **Mainnet** | Untouched | No mainnet transactions or funds used; existing v1 mainnet plan intact. |
