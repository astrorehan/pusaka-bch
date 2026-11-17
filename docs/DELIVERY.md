# Pusaka v2 delivery scope

18 November 2026. Work breakdown implementing [PRODUCT.md](PRODUCT.md).
Stages 1?3 and the app/asset implementations for stages 4?5 are available.
The current selected suites pass 18 v2/asset tests, 26 earlier contract tests and
3 wallet transport tests. Two browser tests pass locally and on the published
Chipnet app. Live Chipnet proves swap, protected token return, contact quorum,
early-finalize rejection, mature BCH payout and the exact multi-heir token payout.
See [current evidence and open qualification gates](proofs/app-and-assets.md).

Stage 6 remains partially qualified: real Paytaca phone approval, v2 mainnet
transactions, a mainnet pair and the organiser's public presentation upload need
user participation. A public Chipnet release and demo script are available.
The existing v1 mainnet plan remains separate and untouched.

## Intended outcome

An owner uses a BCH balance from Pusaka, authorizes transactions with Paytaca,
and leaves the remaining covered assets to multiple heirs. Authorized use renews
activity. Trusted contacts or inactivity can initiate a claim, followed by a real
review delay and an owner cancellation route. One supported swap returns assets
under the same inheritance rules.

The full target includes trading. A BCH-only Send/Receive milestone is useful
progress but does not complete that target. Existing Paytaca addresses and ordinary
wallet screens are not transparently upgraded: onboarding includes a new Pusaka
receive address and an initial transfer.

## Work order and completion conditions

### 1. Prove the usable balance

Build the smallest executable contract and transaction flow that can:

- Receive BCH into an authenticated inheritance-aware balance.
- Send part to an owner-chosen recipient while preserving protected change.
- Update owner activity in the same transaction.
- Receive another ordinary payment without a fresh inheritance allocation.
- Send again and recover the same balance from a fresh app session.

Investigate the receive/inbox construction and fee/owner-input requirements using
the actual installed SDK. Incoming money must not itself renew activity. A receipt
that can only be imported with the owner's approval does not satisfy the intended
receive behavior, because the owner may already be unavailable.

Deliverables: minimal contract or covenant, repeatable meaningful tests, exact
transaction accounting and a short proof record. Validate locally, then on Chipnet
with the real external signer. A Paytaca-approved partial send is required before
calling the wallet integration proved; a stand-in signer alone is insufficient.

Completion: fund, send part, receive again, send again and restore all work. The
remaining balance and new receipts have an enforceable inheritance path, rather
than merely appearing protected in the UI.

This is the immediate next implementation task. It does not include a dashboard
redesign, a swap interface or migration of the existing mainnet plan.

### 2. Prove the claim review clock

Build a minimal claim-open, owner-cancel and finalize construction. Establish a
new authenticated claim anchor when review starts and enforce the complete delay
from its chain age. Exercise the real compiler, SDK and transaction sequence fields.

Deliverables: executable proof and adversarial tests for backdated locktime, early
finalization, wrong or replayed claim anchor, and deposits or repeated requests
that try to restart or shorten the delay. Include owner cancellation.

Completion: the network refuses every early payout, and a valid owner action
invalidates the pending claim. Use a test configuration to exercise the protocol;
production and demo timing remain explicitly different.

If the SDK cannot construct the required transaction, investigate a small dedicated
covenant or lower-level builder before selecting the production construction.
Do not substitute a browser countdown for the enforced delay.

### 3. Build the complete version 2 contract

Combine the proven wallet and claim mechanisms into one versioned policy:

- Owner-directed Send, standalone check-in and owner exit.
- Protected incoming funds and change, with complete fee accounting.
- Heirs and shares using the existing equal, custom and faraid calculations.
- Owner-authorized policy updates; old approvals invalidated when policy changes.
- Three distinct trusted contacts, with two approvals opening early claim review.
- A separate inactivity route that does not depend on contacts cooperating.
- Active, Review and payout behavior, including owner cancellation by ordinary use.
- Fixed recipient enforcement, balance conservation and correctly rounded shares.
- Defined handling of an empty balance, receipts during review and late receipts
  after payout; an already-issued receive address must not strand funds.

Deliverables: separate v2 artifacts, tests under real transaction limits, and a
documented plan format. Retain v1 read and exit support; old funded contracts are
not upgraded by changing an artifact in the app.

Completion: owner, contacts, an unrelated submitter and heirs can exercise the
full state machine on Chipnet; unauthorized actions and invalid payouts fail.

### 4. Integrate the owner and family app flows

Build on the existing app, components, calculator and WizardConnect bridge:

- Extract a browser-safe v2 adapter from the verified Node transaction builders.
  The shared browser module lives at `app/src/lib/protocol/`; Node runners
  re-export it without loading artifacts through `node:fs`. Bundle the v2 artifacts as data, retain the
  verified codecs and accounting, and keep fixture keys and network runners out
  of the browser bundle.
- Setup: heirs, shares, contacts, periods, new-address explanation and funding review.
- Owner home: one protected balance, Send, Receive, latest owner activity and plan.
- Claims: contact confirmations, quorum progress, reason, review time and Stop claim.
- Heir view: open plan link, inspect entitlement, follow review and submit payout.
- Recovery: portable plan data, reconnect and restore without a stored spending key.
- Transaction review: every payment, protected change, state-carrying value and fee;
  then pending, confirmed, cancelled and failed outcomes.
- Clear distinction between ordinary Paytaca funds and the protected Pusaka balance.
- Retain one small ordinary authorization coin during setup, display the identity
  carrier and fee funding explicitly, and use the builder's accounting to avoid
  counting wallet change twice. Explain that taking funds back leaves the issued
  receive address protected for later receipts; it does not disable that address.

Deliverables: usable mobile flows for owner, contact and heir; version-aware plan
loading; real Paytaca signing requests for the supported actions.

Completion: a fresh user can configure a plan, pay from it, receive, save/share it,
stop a false claim and follow a valid claim using the app. UI state must follow
chain state and must never count incoming transfers as proof of life.

### 5. Add one supported trading flow and token inheritance

Select one concrete BCH-to-fungible-CashToken swap integration after inspecting
its transaction construction and compatibility. This scope is one integration,
not compatibility with arbitrary dapps.

Work includes the quote, minimum return, owner approval, swap transaction, protected
change, protected returned token, balance discovery and activity update. Implement
inheritance of the returned token under the same family rules, including carrier
values, fees and indivisible remainders. A swap button that leaves proceeds outside
coverage does not pass.

Deliverables: a real supported pair and an end-to-end record of swap, protected
proceeds and correct token payout. Use a supported test environment first. Any
small mainnet-only compatibility check needs a concrete transaction review and
the owner's normal wallet approval.

Completion: the owner can trade through this integration and leave the resulting
covered assets to the heirs without a separate inheritance allocation.

### 6. Qualify and present the complete product

- Run the adversarial checks in the architecture document and the applicable
  existing regression tests.
- Exercise the complete lifecycle on Chipnet, then verify the supported mainnet
  actions with small reviewed transactions and wallet approvals.
- Verify real phone signing, reconnect, fresh-session recovery, rejected approvals,
  stale state and competing claim/cancellation submissions.
- Publish the working app and update the guide, evidence, presentation and demo
  around behavior actually proved, with the reused Monad work declared accurately.

The demonstration must show: normal spending renewing life; new receipts remaining
covered; a false claim stopped by the owner; a valid claim paying multiple heirs;
and the supported swap leaving inheritable proceeds.

Completion: the demonstrated release and its documentation agree, and each
mainnet claim has a transaction or an explicitly stated remaining limitation.
The milestones are useful progress records, not a substitute for these outcomes.

## Reuse and boundaries

Reuse the share calculator, brand, existing UI components, Paytaca connection and
serialization bridge, plan export concept, test fixtures and prior transaction
experience. Review and adapt them for v2; their v1 behavior does not automatically
prove the new construction.

Keep the earlier spouse-property and bequest logic in the reuse inventory. Its
off-chain calculation and any claimed on-chain validation are separate scope.
The immediate work prioritizes the usable balance and family claim protection.

Outside this release: EIP-7702 itself, inheriting untouched ordinary Paytaca or
exchange balances, arbitrary DeFi positions, a universal NFT split, bank payout,
passkey-only check-in and guaranteed notification delivery. Message signing,
sponsored fees and wallet-native embedding are follow-on integrations unless a
proved core requirement makes one necessary.

## Managing uncertainty

Stages 1 and 2 decide the construction before large UI changes. If either fails,
record the specific failed proof, proposed alternative and impact on the product
promise. Do not quietly replace the target with the previous savings-plan MVP.

The receive path, claim anchor and external swap composition are the principal
unproved dependencies. Set a reliable delivery estimate after the first two
proofs; do not promise that six work packages fit a fixed number of days merely
because the previous UI already exists.

Implementation proceeds through reviewable artifacts and test transactions.
Real-wallet approval is needed when exercising that wallet, not for routine
development and offline checks. Nothing in this scope requires a seed phrase or
unannounced movement of the earlier funded plan.
