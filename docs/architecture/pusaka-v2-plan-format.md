# Pusaka v2 Plan Format & On-Chain State Layout (`pusaka-v2`)

Date: 17 November 2026
Status: Stage 3 Specification & SDK Schema (`contract/scripts/v2/pusaka-v2.ts`)

This document defines the versioned off-chain metadata schema (`pusaka-v2`) and on-chain binary layouts for Pusaka v2. Legacy `version: 1` (`pusaka-v1` / [`Pusaka.scash`](../../contract/contracts/Pusaka.scash)) links and deployed plans remain completely separate and unmodified.

---

## 1. Design Principles

1. **Cycle-Free Covenant DAG**:
   - [`PusakaV2Anchor.scash`](../../contract/contracts/PusakaV2Anchor.scash): constructor `(planCategory, ownerPkh)` -> reads `reviewSequence` dynamically from its 8-byte `none`-NFT commitment (`bytes4(round) || bytes4(reviewSequence)`) and authenticates input 0 via `planCategory + 0x02`.
   - [`PusakaV2Plan.scash`](../../contract/contracts/PusakaV2Plan.scash): constructor `(planCategory, ownerPkh, anchorLockingBytecode)` -> holds the unique `minting` NFT (`planCategory + 0x02`) and all protected BCH directly. Mutable policy (`heirs`, `contacts`, `inactivityPeriod`, `reviewSequence`, `feeBudget`) is committed by `policyHash = hash256(policyBytes)` inside the 51-byte NFT commitment rather than baked into constructor args.
   - [`PusakaV2Inbox.scash`](../../contract/contracts/PusakaV2Inbox.scash): constructor `(planCategory, planLockingBytecode, perInputFeeCap)` -> derives a single long-lived ordinary P2SH32 receive address (`inboxAddress`) that **never changes** across owner policy edits, partial spends, claim reviews, exits, or payouts.
2. **No Stranded Funds & Post-Exit Protection (`CLOSED`)**:
   - Owner full spendable drains, `ownerExit()` (`CLOSED`), and `finalizeClaim()`/`distributeLate()` (`PAID_OUT`) always preserve a `>= 1,000`-satoshi Plan `minting`-NFT carrier so `inboxAddress` remains continuously sweepable and recoverable.
   - `CLOSED` (`0x03`) represents a withdrawn/retired balance with the long-lived `inboxAddress` still active. `ownerExit()` is timestamp-authenticated (`tx.time >= 500000000`) and renews `deadline = max(curDeadline, tx.locktime + period)` (bounded `<= 4294967295`).
   - Any post-exit receipts swept into `CLOSED` remain owner-recoverable (`ownerExit()` / `checkIn()`) AND retain both inheritance paths (`openClaimByInactivity()` after `deadline` and 2-of-3 `contactApprove()` quorum) whenever spendable funds exist (`tx.inputs[0].value > 1000`). A 1st contact vote preserves `CLOSED` without silently reactivating the plan; only 2-contact quorum or expired inactivity enters `REVIEW` and mints a fresh `PusakaV2Anchor` for a full `reviewSequence` delay. Sweeps into `CLOSED` never renew `deadline` or reset votes. (Reaching zero balance via `ownerExit()` retires the current balance, not a promise to disable future receipts at the old `inboxAddress` from following the family plan.)
3. **Bounded Owner Fee Funding**:
   - Owner actions (`send`, `checkIn`, `cancelClaim`, `updatePolicy`) require an authenticated `ownerPkh` co-spend (`inputs[1]` or `inputs[2]` during `REVIEW`) committing to the transaction, and allow up to `10,000` sats (`MAX_OWNER_TX_FEE`) of network fee to be drawn from protected BCH above the `1,000`-sat carrier (`outputs[0].value >= max(1000, nextPlanSats - 10000)`).
   - Non-plan change outputs cannot draw on protected funds (`change <= extraIn`) and, whenever any fee is taken from protected funds, change must return to `ownerLock`. A small persistent ordinary authorization coin (e.g. `600` sats) can therefore be returned intact across repeated owner actions without repeated ordinary-wallet top-ups.
   - SDK builders accept `ownerUtxos?: Utxo[]` (and `ownerUtxo?: Utxo`) with `feeFunding?: 'auto' | 'owner' | 'protected'`, preserving legacy owner-funded behavior in `'auto'` when ordinary coins leave `>= 546` sats change and otherwise using protected/hybrid fees so the owner auth coin is not silently burned.

---

## 2. On-Chain Binary Layouts

### 2.1 Plan `minting` NFT Commitment (51 bytes)

| Offset | Length | Field | Encoding / Notes |
|---:|---:|---|---|
| `0` | `1` | `version` | `0x02` |
| `1` | `1` | `status` | `0x00` = `ACTIVE`, `0x01` = `REVIEW`, `0x02` = `PAID_OUT`, `0x03` = `CLOSED` |
| `2..5` | `4` | `round` | uint32 LE (`0..2147483646`); incremented on `send`, `checkIn`, `cancelClaim`, `updatePolicy`, `ownerExit`, and `REVIEW` entry |
| `6` | `1` | `approvalsMask` | Bitmask `0x00..0x07` (`1 << contactIndex`); wiped to `0x00` on owner action (`send`, `checkIn`, `cancelClaim`, `updatePolicy`, `ownerExit`) or `REVIEW` entry |
| `7..14` | `8` | `deadline` | uint64 LE UNIX seconds (`<= 0xffffffff = 4294967295` on genesis/renewal) |
| `15..18` | `4` | `inactivityPeriod` | uint32 LE seconds (`> 0`, `< 2^31`) |
| `19..50` | `32` | `policyHash` | `hash256(policyBytes)` |

### 2.2 Canonical `policyBytes` Preimage (`101..317` bytes)

| Offset | Length | Field | Validation |
|---:|---:|---|---|
| `0..3` | `4` | `inactivityPeriod` | uint32 LE (`> 0`, `< 2^31`) |
| `4..7` | `4` | `reviewSequence` | uint32 LE time-based BIP68 (`4194305..4259839`, i.e. `0x00400001..0x0040ffff`, 512s upward quanta) |
| `8..11` | `4` | `feeBudget` | uint32 LE (`500..100000`, default `5000` sats) |
| `12..31` | `20` | `contact0` | P2PKH PKH (distinct from `contact1`, `contact2`, `ownerPkh`) |
| `32..51` | `20` | `contact1` | P2PKH PKH |
| `52..71` | `20` | `contact2` | P2PKH PKH |
| `72..75` | `4` | `totalShares` | uint32 LE (`== sum(heirShares) > 0`) |
| `76` | `1` | `heirCount` | `1..10` |
| `77..` | `24 * N` | `heirs[0..N-1]` | `[bytes20 heirPkh, uint32LE heirShare]` (`heirShare > 0`) |

Off-chain equal, custom percentage, or Faraid calculators produce the integer `heirShares` / `totalShares` tuple off-chain; `PusakaV2Plan` enforces the committed integer division `floor(pot * heirShare / totalShares)` on-chain without asserting on-chain Faraid jurisprudence rules.

### 2.3 Anchor `none` NFT Commitment (8 bytes)

| Offset | Length | Field | Encoding |
|---:|---:|---|---|
| `0..3` | `4` | `round` | uint32 LE matching Plan's `REVIEW` `round` |
| `4..7` | `4` | `reviewSequence` | uint32 LE matching `policyBytes[4..7]` |

---

## 3. Versioned Public Metadata JSON (`version: "pusaka-v2"`)

Links use base64url-encoded UTF-8 JSON fragments (`https://pusaka.cash/v2/plan#<base64url(JSON)>`):

```json
{
  "version": "pusaka-v2",
  "network": "chipnet",
  "planCategoryHex": "<64-hex>",
  "ownerPkhHex": "<40-hex>",
  "planAddress": "bchtest:p...",
  "planLockHex": "<70-hex P2SH32>",
  "anchorAddress": "bchtest:p...",
  "anchorLockHex": "<70-hex P2SH32>",
  "inboxAddress": "bchtest:p...",
  "inboxLockHex": "<70-hex P2SH32>",
  "perInputFeeCap": "600",
  "policyBytesHex": "<202..634 hex>",
  "policyHashHex": "<64-hex>",
  "createdAtLocktime": 1794922748,
  "inactivityPeriodSeconds": 2592000,
  "reviewSequence": 4194811,
  "reviewUnits": 507,
  "effectiveReviewSeconds": 259584,
  "feeBudget": "5000",
  "contacts": ["<40-hex>", "<40-hex>", "<40-hex>"],
  "totalShares": "120",
  "heirs": [
    { "pkhHex": "<40-hex>", "share": "15", "label": "Spouse" }
  ]
}
```

`attachPusakaV2Plan()` checks `metadata.network === provider.network`, re-computes `hash256(policyBytes)`, checks all decoded policy fields (including `reviewUnits` and `effectiveReviewSeconds`) against metadata, re-derives `anchorLock`, `planLock`, and `inboxLock` from immutable identity arguments, and (when `verifyOnChain !== false`) compares `policyHashHex` against the live Plan NFT commitment, failing closed with `PolicyHashMismatchError` on stale metadata links after a policy update.

## Asset-enabled revision

New app setups add `protocolRevision: assets-1`. Missing revision retains the original
v2 contract artifact; unknown revisions are rejected. The state and policy bytes
remain unchanged, but the plan locking script uses `PusakaAssetPlan`. Its separate
fungible vault binds that exact plan locking script. See [the current asset proof](../proofs/app-and-assets.md).
