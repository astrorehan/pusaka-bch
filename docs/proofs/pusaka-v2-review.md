# Pusaka v2 Stages 1–3 Independent Review

Date: 17 November 2026
Scope: Independent source, SDK, test, and proof review of Pusaka v2 Stages 1–3 (`PusakaV2Plan.scash`, `PusakaV2Anchor.scash`, `PusakaV2Inbox.scash`, `contract/scripts/v2/pusaka-v2.ts`, `contract/scripts/v2/claim-review-verifier.ts`, `contract/test/v2/PusakaV2.test.ts`, `docs/proofs/pusaka-v2.md`, `docs/architecture/pusaka-v2-plan-format.md`) against `docs/PRODUCT.md`, `docs/DELIVERY.md`, `docs/architecture/inheritance-wallet.md`, and `docs/proofs/v2-integration.md`.

---

## Executive Summary

The Stage 3 covenant architecture (`PusakaV2Plan` `2,931 B`, `PusakaV2Anchor` `129 B`, `PusakaV2Inbox` `256 B`) cleanly resolves the cycle-free covenant DAG, unforgeable `minting`/`none` NFT provenance, time-based BIP68 CSV review clock, atomic owner cancellation during `REVIEW`, contact double-vote/replay prevention, and self-funded/sponsored fee-reserve conservation (no caller-change skimming on `openClaimByInactivity`, `finalizeClaim`, `distributeLate`, or `PusakaV2Inbox.sweep`).

However, independent review and executable repros in [`contract/test/v2/PusakaV2Review.test.ts`](../../contract/test/v2/PusakaV2Review.test.ts) confirm **one High-severity covenant defect** (post-`ownerExit()` receipts at `inboxAddress` become permanently unclaimable by heirs if the owner is unavailable), **one Medium-severity covenant + SDK usability/lockout defect** (owner actions—including `cancelClaim` during `REVIEW`—require ~2,700–3,700 sats in an external P2PKH co-input because protected funds cannot cover owner-action fees), **one Low/Medium SDK metadata validation gap**, and minor operational/proof-accuracy notes.

---

## Findings

### [HIGH-1] Post-`ownerExit()` (`CLOSED`, `0x03`) Receipts at `inboxAddress` Are Permanently Stranded if Owner Becomes Unavailable

- **Locations:**
  - [`contract/contracts/PusakaV2Plan.scash:46-49`](../../contract/contracts/PusakaV2Plan.scash#L46-L49) (`deposit()` allows `statusByte == 0x03`)
  - [`contract/contracts/PusakaV2Plan.scash:328-361`](../../contract/contracts/PusakaV2Plan.scash#L328-L361) (`ownerExit()` enters `0x0203` `CLOSED`)
  - [`contract/contracts/PusakaV2Plan.scash:375`](../../contract/contracts/PusakaV2Plan.scash#L375) (`contactApprove()` requires `header == 0x0200`)
  - [`contract/contracts/PusakaV2Plan.scash:452`](../../contract/contracts/PusakaV2Plan.scash#L452) (`openClaimByInactivity()` requires `header == 0x0200`)
  - [`contract/contracts/PusakaV2Plan.scash:513`](../../contract/contracts/PusakaV2Plan.scash#L513) (`finalizeClaim()` requires `header == 0x0201`)
  - [`contract/contracts/PusakaV2Plan.scash:591`](../../contract/contracts/PusakaV2Plan.scash#L591) (`distributeLate()` requires `header == 0x0202`)
  - [`contract/contracts/PusakaV2Inbox.scash:15-50`](../../contract/contracts/PusakaV2Inbox.scash#L15-L50) (`sweep()` sweeps `inboxAddress` UTXOs into `PusakaV2Plan` regardless of status)
- **Failure Behavior:**
  1. `ownerExit()` withdraws `planSats - 1,000` to `ownerPkh` and sets Plan status to `CLOSED (0x03)`, leaving the `1,000`-sat `minting` NFT carrier alive so `inboxAddress` remains sweepable.
  2. Any future plain-BCH payment arriving at the already-issued `inboxAddress` sweeps cleanly into the `CLOSED (0x03)` Plan UTXO via `PusakaV2Inbox.sweep()` + `PusakaV2Plan.deposit()`.
  3. Only `deposit()`, `checkIn()` (requires `ownerPkh` signature), and `ownerExit()` (requires `ownerPkh` signature) accept `0x0203`. `contactApprove()`, `openClaimByInactivity()`, `finalizeClaim()`, and `distributeLate()` all reject `CLOSED (0x03)`.
  4. If the owner subsequently dies or loses their signing key, any funds received at `inboxAddress` after `ownerExit()` have **zero enforceable inheritance or recovery path** and are permanently locked in `CLOSED`.
  5. By contrast, draining the entire spendable balance via `send(recipientLock, spendableBalanceSats)` leaves the `1,000`-sat carrier in `ACTIVE (0x00)`, preserving full heir protection for future `inboxAddress` receipts.
- **Requirement Mismatch:** Violates [`docs/PRODUCT.md:157-161`](../PRODUCT.md#L157-L161) ("Later transfers, incoming funds during review and already-issued receive addresses must never create stranded or unprotected coins"), [`docs/DELIVERY.md:42-44,79-80`](../DELIVERY.md#L42-L44), [`docs/architecture/inheritance-wallet.md:157-158`](../architecture/inheritance-wallet.md#L157-L158), and [`docs/proofs/v2-integration.md:32-34`](v2-integration.md#L32-L34).
- **Repro:** Test 1 in [`contract/test/v2/PusakaV2Review.test.ts`](../../contract/test/v2/PusakaV2Review.test.ts) (`[REPRO Defect #1]`) executes `ownerExit()` -> receives `50,000` sats at `inboxAddress` -> self-sweeps into `CLOSED` -> advances `10,000s` past `deadline` -> verifies `openClaimByInactivity`, `contactApprove`, and `distributeLate` all fail on-chain, failing the requirement assertion.
- **Suggested Fix:**
  - Option A (Recommended): Allow `openClaimByInactivity()` and `contactApprove()` from `CLOSED (0x03)` (as well as `ACTIVE (0x00)`), and have `ownerExit()` require `tx.time >= 500000000` and advance `deadline` (`max(curDeadline, tx.locktime + period)`). While empty (`1,000` sats), `finalizeClaim()` still rejects (`pot <= 0` / dust), so no false payout is possible; if new money arrives at `inboxAddress` while the owner is alive, the owner gets `inactivityPeriod` + full `reviewSequence` to recover via `ownerExit()` / `checkIn()`; if the owner is unavailable, contacts or inactivity can open `REVIEW` and pay heirs.
  - Option B: Eliminate `CLOSED (0x03)` as an unclaimable sink by having `ownerExit()` transition to `ACTIVE (0x00)` with the `1,000`-sat carrier and an updated `deadline` (matching full `send()` drain semantics).

---

### [MEDIUM-2] Owner-Fee Co-Input Constraint Locks Out Owner Actions (Including `cancelClaim` During `REVIEW`) When Nearly All Funds Are in Pusaka

- **Locations:**
  - [`contract/contracts/PusakaV2Plan.scash:126,186,232,318`](../../contract/contracts/PusakaV2Plan.scash#L126) (`send`, `checkIn`, `cancelClaim`, `updatePolicy` require `tx.outputs[0].value >= nextPlanSats` / `tx.inputs[0].value`)
  - [`contract/contracts/PusakaV2Plan.scash:335`](../../contract/contracts/PusakaV2Plan.scash#L335) (`ownerExit` blocked during `REVIEW`)
  - [`contract/scripts/v2/pusaka-v2.ts:1041-1066,1395,1519,1626,1720`](../../contract/scripts/v2/pusaka-v2.ts#L1041-L1066) (`withFundedPlainUtxoPreference(..., 5000n)` and single `ownerUtxo: Utxo` parameters)
- **Failure Behavior:**
  - Because `PusakaV2Plan` is `2,931 B`, every owner transaction is `~3,450–3,681 B` (`~3,470–3,700` sats min relay fee).
  - Because the covenant forbids paying ANY of that fee from the protected balance in `send`, `checkIn`, `cancelClaim`, or `updatePolicy`, an owner who transferred nearly all BCH into Pusaka and retained `< ~3,500` sats externally (or whose persistent owner coin dropped below `~3,500` sats after 1–2 sends) cannot execute `send()`, `checkIn()`, or `updatePolicy()`.
  - Critically, if a false claim triggers `REVIEW` while the owner's ordinary P2PKH coin has `< ~2,700` sats, the owner cannot `cancelClaim()` (even reclaiming the `1,000`-sat anchor still leaves `~2,700` sats needed from `ownerUtxo`) AND `ownerExit()` is blocked during `REVIEW`.
  - Additionally, the SDK methods only accept a single `ownerUtxo: Utxo`, even though the contract's `for (int i = 1/2; i < int(tx.inputs.length); i++)` loop supports multiple plain-BCH owner co-inputs.
- **Requirement Context:** [`docs/architecture/inheritance-wallet.md:70-73`](../architecture/inheritance-wallet.md#L70-L73) specifically requires proving *"the case where nearly all owner funds are in Pusaka. Do not require a surprising second top-up before each payment. A small persistent owner coin or a different supported authorization route must have explicit fee accounting."*
- **Distinction (Covenant vs. SDK/UX):** The inability to fund owner-action fees from protected balance is a **covenant design constraint**; the single-UTXO `ownerUtxo` restriction is an **SDK gap**.
- **Repro:** Test 2 in [`contract/test/v2/PusakaV2Review.test.ts`](../../contract/test/v2/PusakaV2Review.test.ts) (`[REPRO Finding #2]`) shows `100,000` sats in Pusaka + two `1,850`-sat external P2PKH coins: single-UTXO `buildSendTx` and `buildCancelClaimTx` fail, taking fee from Plan fails on-chain (`protected change underfunded`), while raw multi-input `cancelClaim` with both `1,850`-sat coins succeeds.
- **Suggested Fix:**
  - Covenant-level: Because `send`, `checkIn`, `cancelClaim`, and `updatePolicy` already require an `ownerPkh` P2PKH co-spend (committing to the exact transaction), allow `outputs[0].value >= nextPlanSats - feeBudget` (capped at `>= 1000` carrier; or `>= nextPlanSats - maxOwnerTxFee` where `maxOwnerTxFee = 10_000` sats). A `600`-sat persistent authorization coin can then be returned intact (`600` sats change) indefinitely without external top-ups.
  - SDK-level: Accept `ownerUtxos: Utxo[]` across `buildSendTx`, `buildCheckInTx`, `buildCancelClaimTx`, `buildUpdatePolicyTx`, and `buildOwnerExitTx`, and document persistent auth-coin sizing if the fee model stays external.

---

### [LOW/MEDIUM-3] Metadata Integrity Check Skips `reviewUnits`, `effectiveReviewSeconds`, and Network Cross-Checks; Unbounded Year-2106 `deadline` Overflow

- **Locations:**
  - [`contract/scripts/v2/pusaka-v2.ts:832-879`](../../contract/scripts/v2/pusaka-v2.ts#L832-L879) (`verifyMetadataFieldsMatchPolicy`)
  - [`contract/scripts/v2/pusaka-v2.ts:416-418,1148,1759`](../../contract/scripts/v2/pusaka-v2.ts#L416-L418) (`inactivityPeriodSeconds < 2^31`, `deadline` computation)
  - [`contract/contracts/PusakaV2Plan.scash:274,310,460`](../../contract/contracts/PusakaV2Plan.scash#L274) (`newDeadline = tx.locktime + newPeriod`, `require(tx.time >= deadline)`)
- **Behavior:**
  1. `verifyMetadataFieldsMatchPolicy()` verifies `policyBytesHex`, `policyHashHex`, `inactivityPeriodSeconds`, `reviewSequence`, `feeBudget`, `totalShares`, `contacts`, and `heirs`, but **does not check** `metadata.reviewUnits === policy.reviewUnits`, `metadata.effectiveReviewSeconds === policy.effectiveReviewSeconds`, or `metadata.network === provider.network` (recall `mocknet` and `chipnet` share the `bchtest:` address prefix). A tampered link claiming `effectiveReviewSeconds: 1_209_856` (14 days) while `reviewSequence` is `512s` passes `attachPusakaV2Plan()` without error.
  2. `PusakaV2Plan.scash` stores `deadline` in 8 bytes (`uint64`), while `openClaimByInactivity` uses `OP_CLTV` (`tx.time >= deadline`) where BCH `tx.locktime` is a 32-bit unsigned integer (`<= 0xffffffff = 4,294,967,295`). If `tx.locktime + newPeriod > 0xffffffff` (e.g., very large `inactivityPeriod` close to `2^31 - 1`), `openClaimByInactivity` becomes permanently unsatisfiable by `OP_CLTV`.
  3. Minor constructor/genesis hygiene: `contactApprove` checks `c0 != c1 && c0 != c2 && c1 != c2` but relies on `updatePolicy` / SDK `encodePolicyBytes` for `contacts != ownerPkh`; `openClaimByInactivity` / `finalizeClaim` / `distributeLate` rely on genesis SDK / `updatePolicy` for `feeBudget in [500, 100000]`.
- **Repro:** Test 3 in [`contract/test/v2/PusakaV2Review.test.ts`](../../contract/test/v2/PusakaV2Review.test.ts) (`[REPRO Finding #3]`) demonstrates `attachPusakaV2Plan()` accepting tampered `effectiveReviewSeconds: 1_209_856` while `policy.effectiveReviewSeconds` is `512`.
- **Suggested Fix:** Validate `metadata.reviewUnits === policy.reviewUnits`, `metadata.effectiveReviewSeconds === policy.effectiveReviewSeconds`, and `metadata.network === provider.network` inside `attachPusakaV2Plan()` / `verifyMetadataFieldsMatchPolicy()`, and bound `inactivityPeriodSeconds` (e.g. `<= 10 * 365 * 86400` or check `deadline <= 0xffffffff`).

---

### [LOW/OPERATIONAL-4] `PusakaV2Inbox.sweep()` `O(N²)` Input Loop & Small-Deposit Self-Sweep Threshold

- **Locations:**
  - [`contract/contracts/PusakaV2Inbox.scash:29-37,41-44`](../../contract/contracts/PusakaV2Inbox.scash#L29-L44)
  - [`contract/scripts/v2/pusaka-v2.ts:1265-1274`](../../contract/scripts/v2/pusaka-v2.ts#L1265-L1274)
- **Notes (Product/Operational Behavior, Not a Covenant Security Defect):**
  - Each `PusakaV2Inbox` input is `~371 B` wire size (`256 B` bytecode + constructor args + outpoint), so a single small receipt (`546..3,600` sats) cannot self-sweep alone (`self-sweep cannot shrink plan`). It remains safely recoverable via either `sponsored` sweep or batching multiple inbox UTXOs in one `self` sweep (`10 x 800 = 8,000` sats verified in Test 5).
  - `PusakaV2Inbox.sweep()` runs `for (int i = 1; i < int(tx.inputs.length); i++)` in each inbox input (`O(N^2)` iterations across `N` inbox UTXOs), so app sweepers should batch large numbers of inbox UTXOs in bounded chunks (e.g., `<= 20` per tx).
  - Plain BCH sent directly to `planAddress` (instead of `inboxAddress`) cannot be swept by `deposit()`/`send()` (`this.activeInputIndex == 0` on `PusakaV2Plan`); UI must surface only `inboxAddress` as the receive address.

---

### [INFO-5] Verification Coverage & Proof Record Accuracy (`docs/proofs/pusaka-v2.md`)

1. **Priorities 1–3 Security Properties Verified Clean:**
   - **NFT provenance & minting authority:** Only `PusakaV2Plan` holds `planCategory + 0x02`; no function allows minting extra `minting`/`mutable` NFTs; `none`-capability `PusakaV2Anchor` NFTs are minted solely on `REVIEW` entry with `nextRoundBytes || seqBytes`, and must be consumed & burned on `finalizeClaim`, `send`, `checkIn`, `cancelClaim`, or `updatePolicy` when in `REVIEW`.
   - **BIP68 CSV & CLTV:** `PusakaV2Anchor.finalize()` enforces `tx.version >= 2`, `reviewSequence in [4194305, 4259839]`, `this.age >= reviewSequence`, and `StrictBip68ChainVerifier` proves historical `prevMtp` enforcement. `send`, `checkIn`, `cancelClaim`, `updatePolicy` enforce `tx.time >= 500000000` (preventing `sequence = 0xffffffff` CLTV bypass) and never shrink `deadline` on `send`/`checkIn`/`cancelClaim`.
   - **BCH conservation & recipient binding:** Self-funded `openClaimByInactivity` (`outputs.length == 2`), `finalizeClaim` (`outputs.length == 1 + heirCount`), `distributeLate` (`outputs.length == 1 + heirCount`), and `PusakaV2Inbox.sweep` (`outputs.length == 1`, `outputs[0] >= inputs[0]`) strictly forbid caller-change outputs; sponsored modes preserve `100%` of vault/inbox value plus rounding remainder.
   - **10-heir worst-case headroom:** Previously `PusakaV2.test.ts` tested 10 heirs only on `genesis`, self-funded `openClaimByInactivity`, and self-funded `finalizeClaim`. Test 4 in `PusakaV2Review.test.ts` additionally verifies **10-heir (`317 B` `policyBytes`)** `updatePolicy` during `REVIEW` (with `Signer.external` + atomic Anchor burn), `contactApprove` 1st & 2nd quorum, sponsored `finalizeClaim`, and both self-funded and sponsored `distributeLate` under `BCH_2026_05` VM limits and `< 10,000 B` per-input bounds.
2. **Proof-Claim Accuracy Audit ([`docs/proofs/pusaka-v2.md`](pusaka-v2.md)):**
   - **Overclaim on line 21:** States `ownerExit()` keeps the carrier alive *"so future receipts at `inboxAddress` are never stranded and remain recoverable/reactivatable by the owner."* As proved in **[HIGH-1]**, future receipts at `inboxAddress` ARE stranded if the owner is unavailable.
   - **Compiled sizes (lines 12, 27, 31):** Independently verified against JSON artifacts (`PusakaV2Plan`: `2,931 B`, `PusakaV2Anchor`: `129 B`, `PusakaV2Inbox`: `256 B`).
   - **Honest open gates (lines 4, 76–79):** Accurately notes that local `bitcoind` regtest, post-MTP-maturity live Chipnet `finalizeClaim` / `distributeLate`, real Paytaca mobile signing, and mainnet remain unverified/open.

---

## Executable Verification Commands & Results

1. **Existing Stage 3 Suite (Baseline Verification):**
   - Command (from `contract/`): `npx vitest run -c vitest.solidhat.config.ts test/v2/PusakaV2.test.ts`
   - Result: **6/6 passed** (`121.64s`) under `@bitauth/libauth` `BCH_2026_05` + `StrictBip68ChainVerifier`.
2. **Independent Review Repro & Coverage Suite:**
   - Command (from `contract/`): `npx vitest run -c vitest.solidhat.config.ts --reporter=verbose test/v2/PusakaV2Review.test.ts`
   - Exit Code: `1` (`1 failed | 4 passed (5)`, Duration `75.96s`)
   - Per-Test Outcome:
     - **FAIL** (`81ms`): `[REPRO Defect #1] post-ownerExit receipts swept from inboxAddress into CLOSED are permanently unclaimable by heirs when owner is unavailable` — fails at line `327` (`DEFECT #1: Post-ownerExit CLOSED balance (~47k sats swept from inboxAddress) has no enforceable non-owner / heir claim path when owner is unavailable`).
     - **PASS** (`4,831ms`): `[REPRO Finding #2] exposes owner lockout when protected funds are nearly everything (<3,500 sats external coin) and SDK single-UTXO restriction`
     - **PASS** (`31ms`): `[REPRO Finding #3] attachPusakaV2Plan accepts tampered effectiveReviewSeconds/reviewUnits in metadata JSON`
     - **PASS** (`55,922ms`): `verifies worst-case 10-heir policy (317 B) across updatePolicy during REVIEW, contactApprove quorum, sponsored finalizeClaim, and self/sponsored distributeLate`
     - **PASS** (`12,354ms`): `verifies Anchor-deposit mismatch rejection, contactIndex mismatch rejection, and multi-UTXO small inbox batch sweeps`

---

## Residual Uncertainty

- **Live Chipnet Post-MTP Maturity:** Mature `finalizeClaim` and post-payout `distributeLate` on live Chipnet are currently an open gate (awaiting root's separate `PUSAKA_V2_LEAVE_REVIEW=1` run) and were not touched by this review.
- **Real Paytaca Mobile Wallet Signing:** External signing in tests uses a deterministic local `Signer.external` stand-in (`WcTransactionObject` wire payloads `< 14 KB`); actual Paytaca mobile parsing/UX for multi-input `REVIEW`-cancellation and 10-heir outputs remains unverified until integrated with real Paytaca.
- **Full-Node Regtest (`bitcoind`):** `bitcoind` / `bitcoin-cli` is not installed locally; consensus checks rely on `@bitauth/libauth` `BCH_2026_05` + `@mem-cash/validation` via `StrictBip68ChainVerifier`.

---

## Resolution Status (17 November 2026 — Post-Review Corrections)

The findings recorded above describe the pre-correction Stage 3 artifact (`PusakaV2Plan` `2,931 B`, `PusakaV2Inbox` `256 B`). All three findings and operational hardening items were subsequently addressed in the revised Stage 3 artifact (`PusakaV2Plan` `3,161 B`, `PusakaV2Anchor` `129 B`, `PusakaV2Inbox` `261 B`):

- **[HIGH-1] Resolved:** `PusakaV2Plan.scash` now permits both `contactApprove` (with 1st vote keeping `CLOSED` and 2nd quorum entering `REVIEW`) and `openClaimByInactivity` from funded `CLOSED (0x03)` (`tx.inputs[0].value > 1000`), while `ownerExit()` requires `tx.time >= 500000000` and renews `deadline = max(curDeadline, tx.locktime + period)`. Both routes enforce a newly anchored full BIP68 `reviewSequence` delay, and receipts swept into `CLOSED` never extend `deadline` or wipe votes.
- **[MEDIUM-2] Resolved:** `send`, `checkIn`, `cancelClaim`, and `updatePolicy` allow bounded owner-authorized transaction fees (`<= 10,000` sats above the `1,000`-sat carrier) from protected BCH when signed by `ownerPkh`, with change restricted to `<= extraIn` and `ownerLock`. SDK owner builders accept `ownerUtxos?: Utxo[]` (and `ownerUtxo?: Utxo`) and `feeFunding?: 'auto' | 'owner' | 'protected'`, enabling a single `600`-sat ordinary auth coin to be returned and reused indefinitely without external top-ups.
- **[LOW/MEDIUM-3] Resolved:** `attachPusakaV2Plan()` validates `metadata.network === provider.network`, `reviewUnits`, and `effectiveReviewSeconds`; `checkedDeadline()` and `PusakaV2Plan.scash` enforce `deadline <= 4294967295` and `newPeriod` positive uint31 across genesis, renewals, `updatePolicy`, and `ownerExit`.
- **[LOW/OPERATIONAL-4] Mitigated:** `PusakaV2Inbox` and `pusaka-v2.ts` enforce `MAX_INBOX_SWEEP_INPUTS = 20` per batch.

See [pusaka-v2-corrections.md](pusaka-v2-corrections.md) for the updated verification record, regression test results, and new-artifact live Chipnet transactions.
