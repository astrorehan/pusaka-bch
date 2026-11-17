# Pusaka v2 Stages 1–3 Post-Review Corrections & Verification Record

Date: 17 November 2026
Scope: Resolution and re-verification of the findings in [pusaka-v2-review.md](pusaka-v2-review.md) across [`PusakaV2Plan.scash`](../../contract/contracts/PusakaV2Plan.scash), [`PusakaV2Inbox.scash`](../../contract/contracts/PusakaV2Inbox.scash), [`contract/scripts/v2/pusaka-v2.ts`](../../contract/scripts/v2/pusaka-v2.ts), [`contract/scripts/v2/pusaka-v2-chipnet.ts`](../../contract/scripts/v2/pusaka-v2-chipnet.ts), and Stage 3 tests/docs.

---

## 1. Substantive & Supporting Changes

### 1.1 Fix #1 — `CLOSED (0x03)` Post-Exit Receipts & Timestamp-Authenticated `ownerExit()`
- **Contract (`PusakaV2Plan.scash`, `3,161 B` debug / `120 B` template):**
  - `ownerExit()` now requires `tx.time >= 500000000` (disallowing `sequence = 0xffffffff` CLTV bypass), renews `deadline = max(curDeadline, tx.locktime + period)` with `nextDeadline <= 4294967295`, wipes `approvalsMask` to `0x00`, increments `round`, withdraws spendable BCH (`planSats - 1000`) to `ownerPkh`, and writes `status = CLOSED (0x03)` retaining the `1,000`-sat identity carrier.
  - `contactApprove(contactIndex, policyBytes)` accepts both `ACTIVE (0x00)` and `CLOSED (0x03)`. When in `CLOSED`, it requires `tx.inputs[0].value > 1000` so an empty retired address cannot be armed against zero spendable funds. A first registered contact vote in `CLOSED` preserves `status = CLOSED (0x03)`; only a second distinct contact vote (`nextMask != curMask`) transitions `CLOSED -> REVIEW (0x01)` and mints a fresh `PusakaV2Anchor` for the full BIP68 `reviewSequence`.
  - `openClaimByInactivity(policyBytes)` accepts both `ACTIVE (0x00)` and funded `CLOSED (0x03)` (`tx.inputs[0].value > 1000`) once `tx.time >= deadline`, transitioning to `REVIEW (0x01)` and minting a fresh `PusakaV2Anchor` for the full BIP68 `reviewSequence`.
  - `deposit()` / `PusakaV2Inbox.sweep()` continue accepting incoming funds into `CLOSED` without altering `deadline`, `round`, `approvalsMask`, or `policyHash`. Existing owner recovery (`ownerExit()` from `CLOSED` and `checkIn()` reactivating `CLOSED -> ACTIVE`) and `PAID_OUT` (`distributeLate()`) behavior are preserved.
  - Semantics: `ownerExit()` represents a withdrawn/retired balance with inheritance protection still active for subsequent receipts at the retained long-lived `inboxAddress`; it does not disable future receipts at `inboxAddress` from entering the family plan.
- **SDK (`contract/scripts/v2/pusaka-v2.ts`):**
  - `buildOwnerExitTx()` now requires a valid CLTV timestamp `locktime` (`>= 500_000_000`), enforces `checkedDeadline(locktime, periodSeconds)` (`<= 4294967295`), and supports `ownerUtxos` / `feeFunding`.
  - `buildContactApproveTx()` and `buildOpenClaimByInactivityTx()` accept `ACTIVE` and funded `CLOSED` plans while rejecting empty (`<= 1,000` sat) `CLOSED` plans off-chain as well as on-chain.

### 1.2 Fix #2 — Bounded Owner-Authorized Fee Funding & Persistent `600`-Sat Auth Coin Reuse
- **Contract (`PusakaV2Plan.scash`):**
  - Owner-authenticated functions `send`, `checkIn`, `cancelClaim`, and `updatePolicy` enforce `ownerPkh` P2PKH co-spend binding all transaction inputs and outputs and allow bounded owner-authorized transaction fees (`MAX_OWNER_TX_FEE = 10_000` sats) from protected BCH above the `1,000`-sat identity carrier (`outputs[0].value >= max(1000, nextPlanSats - 10000)`).
  - Non-plan change is strictly bounded (`change <= extraIn`) and, whenever protected BCH pays any portion of the fee (`outputs[0].value < nextPlanSats`), non-plan change must return to `ownerLock` so no funds can be diverted to another party.
  - Public actions (`deposit`, `contactApprove`, `openClaimByInactivity`, `finalizeClaim`, `distributeLate`) remain completely unaffected and never gain protected fee-spending authority.
- **SDK (`contract/scripts/v2/pusaka-v2.ts`):**
  - All five owner builders (`buildSendTx`, `buildCheckInTx`, `buildCancelClaimTx`, `buildUpdatePolicyTx`, `buildOwnerExitTx`) accept `ownerUtxos?: Utxo[]` (plus backwards-compatible `ownerUtxo?: Utxo`) and `feeFunding?: 'auto' | 'owner' | 'protected'`, validating against empty, duplicate, or token-bearing `ownerUtxos`.
  - In `'auto'` mode (where supported by protected funds), legacy owner-funded behavior is preserved when ordinary owner inputs cover the fee and leave `>= 546` sats change (or when no protected funds are available above `1,000` sats + payment); when ordinary inputs are small (e.g. a single `600`-sat persistent authorization coin) or would otherwise burn the last ordinary coin, fees are drawn from protected BCH (or hybrid ordinary excess + protected BCH) so the `600`-sat coin is returned intact and reusable across consecutive owner actions without external top-ups.
  - All owner build results expose explicit accounting: `feeFundingSource`, `ownerFeeSats`, `protectedFeeSats`, `anchorFeeCreditSats`, `ownerChangeSats`, and `planSatsAfter`.
  - Zero ordinary inputs are never claimed to work with the co-spend pattern: onboarding retains at least one small ordinary authorization coin (no seed phrase required).

### 1.3 Additional Preserved Hardening Fixes
- `MAX_CLTV_TIMESTAMP = 0xffffffff` and `checkedDeadline(locktime, periodSeconds)` enforced across genesis, `computeRolledDeadline`, `updatePolicy`, and `ownerExit` (matching `<= 4294967295` and positive uint31 period assertions in `PusakaV2Plan.scash`).
- `attachPusakaV2Plan()` validates `metadata.network === provider.network` and cross-checks `reviewUnits` / `effectiveReviewSeconds` against decoded `policyBytes`.
- `PusakaV2Inbox.scash` (`261 B`) and `pusaka-v2.ts` cap inbox sweep batches at `MAX_INBOX_SWEEP_INPUTS = 20`.

---

## 2. Compiled Artifacts (`npx solidhat compile`)

Command (from `contract/`): `npx solidhat compile` -> `Compiled 10/10 file(s), 10 contract artifact(s)` (`0` errors/warnings).

| Contract | Script Template Size | Compiled Debug Bytecode |
|---|---:|---:|
| `PusakaV2Plan.scash` | `120 B` | `3,161 B` |
| `PusakaV2Anchor.scash` | `66 B` | `129 B` |
| `PusakaV2Inbox.scash` | `12 B` | `261 B` |

---

## 3. Local Consensus & Regression Verification (`BCH_2026_05` + `StrictBip68ChainVerifier`)

Note: local `Signer.external` tests use a deterministic stand-in external signer over `@bitauth/libauth` `BCH_2026_05` + `StrictBip68ChainVerifier`, not `bitcoind` regtest or real Paytaca mobile signing.

| Suite | Result | Notes |
|---|---|---|
| `test/v2/PusakaV2Metadata.test.ts` | `1/1` passed | Boundary tests for `checkedDeadline` and `MAX_CLTV_TIMESTAMP` (`0xffffffff`). |
| `test/v2/PusakaV2Review.test.ts` | `7/7` passed (`84.93s`) | Converted `[REPRO Defect #1]` and `[REPRO Finding #2]` into positive/negative regressions (`[Fix #1a]`, `[Fix #1b]`, `[Fix #2a]`, `[Fix #2b]`), plus tampered `reviewUnits`/`effectiveReviewSeconds`/network metadata rejection, 10-heir policy updates during `REVIEW`, Anchor-deposit mismatch, `contactIndex` mismatch, and 20-UTXO inbox sweep batching. |
| `test/v2/PusakaV2.test.ts` | `6/6` passed | Full Stage-3 lifecycle, 10-heir limits, dual-route BIP68 CSV enforcement, atomic `REVIEW` cancellation, `ownerExit` CLTV renewal & recovery, adversarial attack vectors, and `round = 127 -> 128 -> 129` signed-byte boundary. |
| `test/Pusaka.test.ts` | `11/11` passed (`86.8s`) | Legacy v1 contract untouched. |
| `test/v2/WalletBalance.test.ts` | `4/4` passed (`116.0s`) | Stage 1 proof suite untouched. |
| `test/v2/ClaimReviewProof.test.ts` | `11/11` passed (`0.25s`) | Stage 2 proof suite untouched. |
| `app/scripts/wizard-signing.test.mjs` | `3/3` passed (`0.03s`) | App signing bridge tests untouched. |

---

## 4. Revised-Artifact Live Chipnet Run (`3,161 B` / `261 B`)

Command (from `contract/`):
```powershell
$env:PUSAKA_V2_CHIPNET_BROADCAST="1"; $env:PUSAKA_V2_LEAVE_REVIEW="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/pusaka-v2-chipnet.ts --network chipnet
```

- Start height: `335467`, MTP: `1794927055` (`ownerAddress: bchtest:qz337rz9knzfd692jh4380xvcadfu3x3gs7390dh4j`, start `227,151` sats -> post-run read-only check at height `335470` / MTP `1794927115`: `155,763` sats).
- `planCategoryHex`: `28bec367c1d553c238099bf59e8cc9ceae485c8ee6d58e2a7080714e1332fd53`
- `inboxAddress`: `bchtest:pwjtk9hqx6kc7ehredy6svz4s993g4j9hdgsdeqm4x8ampkzanaasj42wdtyq`

| Step | Transaction ID | Size (B) | Observed Details |
|---|---|---:|---|
| 0. Pre-split `vout=0` | `28bec367c1d553c238099bf59e8cc9ceae485c8ee6d58e2a7080714e1332fd53` | — | `Signer.external` (`185 B`) |
| 1. Genesis (`PusakaV2Plan`) | `b06e2bd26ad3794cc98a30ff5848d3db87684e25b615f31158105a37b66c9859` | `315` | Issues `planCategory` + `inboxAddress` |
| 2a. Inbox deposit 1 (`18,000` sats) | `44415c84f4f3a641fe1b13240c4340c40f2a175021006c5fb14d50b7356c9750` | — | Funds `inboxAddress` |
| 2b. Self-sweep 1 | `68172fdf669d387267375f6a7898f0417d2ca1414182f309b4bb3d9de15b62fd` | `3,821` | `fee: 3,841` sats; `deadline` unchanged |
| 3. Partial `send` 1 | `2de18e3ae65069e041fe11c5fe4bf435ee6194101436320f9f4eeaf4b57059ce` | `3,680` | `feeSource: owner`; `planSatsAfter: 23,159` |
| 4. `updatePolicy` | `9a0c55ab34c1aba099973f7652460be35a30412dff690e1c46b68ddf1c1fb25c` | `3,768` | `inboxUnchanged: true` |
| 5a. Deposit 2 (`15,000` sats) | `9ae8e37faf0480838228c61efface34ffaa0b721a51ad1487f62ddaf732e1e00` | — | Funds `inboxAddress` |
| 5b. Fresh attach + self-sweep 2 | `e7b13283fa36b8dec28597c8cbcb012ad73a23be90f88c2732b00aa192011960` | `3,821` | Reattached from encoded plan link |
| 6a. Contact 1 approval (`ACTIVE`) | `634471f2c087befee90161147087da7d876174dd7df9f3e0fc6fc26c256ebb05` | `3,769` | Sets bit for `c1` |
| 6b. Contact 2 helper fund (`8,000` sats) | `56a290adbfee516982aae0013524635998a907392e33b9b5aed2212cad0af325` | — | Funds `c2` for Anchor deposit |
| 6c. Contact 2 quorum (`ACTIVE -> REVIEW`) | `e4bdb26a205cee698b172ebb438dd023e90ac9911ff80332fbd624af6e5b667e` | `3,856` | Mints `PusakaV2Anchor` |
| 7. Early `finalizeClaim` | *(rejected by node)* | — | Rejected: `non-BIP68-final (code 64)` |
| 8a. Mint `600`-sat auth coin (`:0`) | `1efef0251a7e9e5fca791a270ad241d6c47d08821d8b26251dcccdeed1d0f062` | — | Exact `600`-sat persistent coin |
| 8b. `cancelClaim` during `REVIEW` (`600`-sat coin) | `5abae2e0d93d6f5e4526dfe6faba4c95c9afc1eb1c0f167eb110d103f5dd6e1b` | `3,848` | `protectedFee: 2,868`; `returnedCoin: 600` (`Signer.external`) |
| 8c. Reused `600`-sat coin -> `send` | `02fc625824758f14a7106e8bd599c329eff7d4e6fdb988c6ab4ee12e52088d5f` | `3,680` | `protectedFee: 3,700`; `returnedCoin: 600` (`Signer.external`) |
| 9a. `ownerExit` (`CLOSED`, `1,000`-sat carrier) | `00aaf28f047be83616b5a882f31b7730f135ef9d9a94c4cdd8edb88c7215ab18` | `3,617` | `nextDeadline: 1794927193` |
| 9b. Post-exit deposit (`10,000` sats) | `c35026d92d8010c8f7f0500f1f2d196ddda0a2433f48d3669f3a8ac399fde5f0` | — | Funds `inboxAddress` while `CLOSED` |
| 9c. Post-exit sweep into `CLOSED` | `9cf5bd00ebe5dfe0a718263fd5b99acc072e845847a6031e67437542814ca40d` | `3,821` | Sweeps into `CLOSED` carrier |
| 9d. Owner post-exit recovery (`ownerExit`) | `3277782c432ca90e8438669748da26d0078fac12668ba38097263b79ff33ec15` | `3,617` | Owner recovers post-exit receipt |
| 10a. Second post-exit deposit (`15,000` sats) | `3f84223f2c3dde0950c2c59e8ac814969d13cdff5a8ed1068625ce39b8016b6f` | — | Funds `inboxAddress` while `CLOSED` |
| 10b. Second post-exit sweep into `CLOSED` | `eb8027f1e167eae5b7935abb30c832539db10b5fe19eff95f9ca628a5f07e095` | `3,821` | Sweeps into `CLOSED` carrier |
| 10c. Contact 1 vote from `CLOSED` | `7934bf15aae595620c8bd4236349e90d1d34dde54ff66c3d40aedd2428f1b01a` | `3,769` | Status stays `CLOSED` (`approvalsMask = 2`) |
| 10d. Contact 3 helper fund (`6,000` sats) | `245e63ec0700eac42846d0edd4fb26420e5ad80d6e57200ace529321f39a2eb9` | — | Funds `c3` for Anchor deposit |
| 10e. Contact 2 quorum from `CLOSED` (`-> REVIEW`) | `eff00f17dbf805e3492b879455c14e22874e28b1266a10d6ce3e090e590f1b28` | `3,856` | Enters `REVIEW` from `CLOSED` with fresh Anchor |

---

## 5. Historical Attribution & Remaining Open Gates

- **Pre-correction Chipnet evidence (`2,931 B` artifact):** Earlier Chipnet runs (`91397785...` and [pusaka-v2-mature-chipnet.md](pusaka-v2-mature-chipnet.md) category `5fd7aeec...`) remain archived as historical pre-correction evidence and do **not** verify this revised `3,161 B` artifact.
- **Live maturity gate closed (revised artifact):** the CLOSED-originated anchor
  confirmed at height `335471`. At tip `335480`, previous MTP was `1794927115`
  and spending MTP was `1794927676`: age `561s`, exceeding the `512s` delay.
  The accepted mature payout and late-receipt payout are recorded below.
- **Other open gates:** Local `bitcoind` regtest (`bitcoind` not installed), real Paytaca mobile signing, and mainnet deployment/testing remain open.

## 6. Revised-Artifact Mature Payout and Late Receipts

The wait/resume runner used actual confirmed-anchor BIP68 age, not merely elapsed
wall-clock time. It then submitted these accepted transactions on Chipnet:

| Action | Transaction ID | Bytes |
|---|---|---:|
| Mature `finalizeClaim` after CLOSED-origin review | `9043e1dd23b1fecfb09c198e4b6ba0424f6b5786bf5c9ced3aac06ec318d59fa` | 4,101 |
| New 8,000-satoshi inbox receipt after payout | `f0c9d3ab28b170a78033f494da962a89dd2dd45e742b347541662360ac016be3` | — |
| Permissionless late-receipt sweep | `f7726d21b2e737e59fdeeb7d6acbc5feebc0418e54c74c0f7a40f6e39ba8b19e` | 3,821 |
| `distributeLate` to the three configured heirs | `ad33575d41d0e31db88220a01154974b1e640c76acfe827af1a7c7296e8a46b2` | 3,870 |

Independent decoding of the final transaction and its source transactions verified
each configured heir's address and exact `1,386`-satoshi output, the `1,001`-satoshi
retained plan identity/remainder, and the `3,890`-satoshi network fee. The final
successor remains `PAID_OUT`. The retained public metadata and transaction IDs
are in the [completed verification record](../../contract/scripts/v2/.pusaka-v2-chipnet-completed.json).

### Runner correction and interruption recovery

The initial resume run completed the mature payout and sweep but skipped the
late payout because it used a fixed 5,000-satoshi threshold. Its actual remaining
pot was 4,159 satoshis, sufficient for three equal payouts. The runner now uses
the policy's actual shares and dust checks, requires a successful late payout
before clearing the checkpoint, and saves a completed public proof. Early-payout
testing also fails on unexpected node acceptance or unrelated network errors.

After the original checkpoint was cleared prematurely,
`pusaka-v2-recover-checkpoint.ts` recovered the fixture plan from its genesis,
policy-update and payout transactions. It matched the revealed policy preimage
to the live policy hash and verified the derived plan address before restoring
public metadata. Resuming that existing PAID_OUT plan produced the final late
payout above; no replacement contract was deployed for this recovery.

The contract and transaction-builder portions of stages 1–3 are complete and
verified with fixture signers. The web app still uses v1. Browser integration,
actual Paytaca approval and mainnet verification remain separate work.
