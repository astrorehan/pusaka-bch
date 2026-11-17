# Pusaka v2 integration notes

17 November 2026. These notes guide the stage 3 implementation. They do not mark
the complete v2 product or its external-wallet integration as verified.

## Two constructions must be reconciled

The wallet proof uses SolidCash stateful storage and a separate satoshi container.
The claim-review proof instead uses a manually defined minting-NFT plan UTXO,
plus a separate immutable-NFT anchor. Their transaction builders and state formats
are not interchangeable. Select one coherent balance and state authentication
scheme, or prove the binding between them in every relevant spending path.

Prefer reusing the proven time-based CSV mechanism over recreating the review
clock from transaction locktime. Incoming receipts must not renew life or touch
the active review anchor. A valid owner send or check-in must cancel a pending
review in the same approved transaction, rather than requiring the user to first
exit the plan. The stage 2 cancel path fixes the owner input at index 2 and returns
the plan NFT at output 0; adapt this deliberately for the combined transaction.

## Requirements beyond the standalone clock proof

- Stage 2 intentionally permits anyone to open a claim. The complete contract
  must instead enforce either inactivity or two distinct registered contacts.
- It currently has one fixed heir. Integrate all configured heirs, enforce their
  shares and rounding, and prevent recipient substitution.
- Owner activity and policy changes must invalidate earlier contact approvals.
  Contacts must not increment activity or change the policy themselves.
- Owner-authorized changes to heirs, contacts or periods must preserve the receive
  path for already-issued addresses. Avoid an unverified mutual hash dependency
  between the plan, inbox and anchor contracts.
- Preserve an authenticated successor state, or another enforceable recovery path,
  for late receipts after payout and for empty or deliberately closed plans.
  Burning the only plan identity without a late-receipt path is insufficient.
- A public action may charge the configured bounded network fee, but must not pay
  an arbitrary caller from that fee reserve. The stage 2 self-funded opening now
  rejects an extra caller-change output; keep this property in the combined code.

## Verification handoff

The claim-review suite passes 11 local tests, including the added fee-diversion
regression. Live Chipnet proved early-finalize rejection and cancellation for the
initial construction, before that output-count restriction. A mature finalization
and the revised artifact's live lifecycle remain unverified.

Use the strict verifier from `contract/scripts/v2/claim-review-verifier.ts` for
local time-based tests: the unmodified mock omits source-output median time past
and can accept an immature transaction. Preserve explicit node/Chipnet evidence
separately. A serialized WalletConnect payload is not evidence of Paytaca approval.

Combine the implemented behavior into versioned metadata and a repeatable script.
Record exact compiler, local tests and live transactions in the stage 3 proof.
Retain the v1 artifact and links; do not migrate the user's funded mainnet plan.
