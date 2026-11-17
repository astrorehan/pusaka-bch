# Pusaka product direction

Decision: 17 November 2026. This is the current product direction. It replaces the
three-action MVP as the target, including the exclusions in `Preparation/IDEA.md`.
Those preparation files remain an unchanged record of the pre-hackathon plan.

This document specifies the product direction. The v2 owner/family web app,
browser-safe transaction builders and asset-enabled plan revision are implemented.
A real Chipnet Cauldron V0 swap returns fungible tokens directly into the plan's
asset vault, and the complete BCH review and token inheritance payout have run.
See [the current evidence](proofs/app-and-assets.md). Real Paytaca mobile approval,
v2 mainnet execution and a qualified mainnet pair remain open. The earlier funded
v1 plan is retained separately and has not been upgraded or spent.

## Product promise

**Use your money today. Leave what remains to your family.**

Pusaka should make inheritance a property of a balance the owner can use. The owner
should not have to choose between using their money and protecting their family,
or repeatedly decide how much profit to put into an inheritance pot.

The reference is the earlier Monad `PusakaWallet`: owner-directed transactions,
activity as proof of life, multiple heirs, trusted people and time to stop a false
claim. The BCH implementation must recover these benefits before more landing-page
polish becomes the priority.

## What the two chains can actually provide

Monad's EIP-7702 implementation attaches contract behavior to the existing account.
Its `execute` method records owner activity and executes payments or other calls;
inheritance applies to the registered ERC-20 balances still held by that account.
Activity outside `execute` did not automatically update the old implementation.

BCH does not have EIP-7702 account delegation. Existing Paytaca P2PKH coins retain
their original spending conditions. Connecting a wallet, observing its activity
or collecting an xpub cannot give heirs a new right to spend those coins.

The selected BCH direction is a **Pusaka balance with inheritance rules**, operated
from Pusaka and authorized with the owner's Paytaca wallet. It needs a new receive
address and an initial transfer. This is a real onboarding cost, not something to
hide behind the word "connect". Spending from Paytaca's ordinary Send screen will
not operate this balance without an additional wallet integration.

Inside Pusaka, the owner can pay from the protected balance and receive money back
into it. Unspent change remains protected. Ordinary incoming payments must join
the protected balance without another inheritance allocation decision. This last
requirement needs a proved receive/inbox design; the current SolidCash deployment
address is not automatically such an address.

If keeping the existing Paytaca address and using all its ordinary screens is a
hard requirement, this design does not provide EIP-7702 parity. That requirement
would need wallet cooperation and still cannot rewrite already created P2PKH
coins. We must state this rather than advertise a transparent upgrade.

## Scope decisions

| Benefit | Decision | Implementation status |
|---|---|---|
| Spend part of the protected balance without ending inheritance | Core | New contract and transaction flow required |
| Keep unspent change and new receipts protected | Core | Receive/inbox and accounting proof required |
| Treat authorized payments as proof of life | Core | Must update the plan in the same transaction |
| Manual "I'm still here" as a fallback | Core | Exists in v1; must also cancel a pending claim in v2 |
| Trusted contacts, initially two of three | Core | New authorization, voting and replay protection required |
| A mandatory review period before any payout | Core | New state machine and consensus-enforced delay required |
| Owner cancels a claim by proving activity | Core | Required for both inactivity and contact-triggered claims |
| Equal, custom and Islamic inheritance shares | Retain | Existing calculator and payout work are reusable |
| Earlier spouse-property and bequest calculations | Preserve in the reuse inventory | Keep behind the wallet core; distinguish off-chain calculation from on-chain validation |
| One supported swap whose proceeds return protected | Required to claim a trading use case | Adapter and fungible CashToken inheritance must be proved together |
| Arbitrary third-party dapps and assets held on exchanges | Outside initial compatibility | Do not imply coverage |
| Signed-message check-in and sponsored fees | Investigate after the core wallet proof | Current WizardConnect adapter only exposes transaction signing |
| Passkey-only check-in | Separate research | WebAuthn P-256 is not the current Paytaca signing path |
| Bank payout and Indonesia-specific settlement | Excluded from this BCH release | Not needed to restore the wallet proposition |

Trusted contacts and a review period were removed as a scope simplification, not
because their impossibility on BCH was established. They return to the core. Names
should make their actual authority clear; changing names is not a substitute for
implementing the protection.

## Everyday money flow

1. Connect Paytaca. Choose heirs, shares, trusted contacts, inactivity period and
   review period. Show the rules before any coins move.
2. Explain that Pusaka uses a new address. Transfer the amount the owner wants to
   use through Pusaka. Show the complete initial transfer, state-carrying amounts,
   fee and any small ordinary-wallet authorization coin required by the signer.
3. Show one Pusaka balance with **Send**, **Receive** and the family plan. Do not
   present a frozen inheritance pot and a spendable portion of that same balance.
   The separate ordinary Paytaca balance may be shown as a funding source, with its
   coverage clearly distinguished and never added twice.
4. Send part of the balance. In the same approved transaction, pay the chosen
   destination, preserve protected change, update owner activity and cancel any
   pending inheritance claim. Do not require withdrawing the entire plan first.
5. Receive at the Pusaka receive address. Record the amount as covered only when
   the receive path enforces the inheritance rules. Incoming transfers do not
   update proof of life. An import that still needs owner approval must be shown
   as pending, not already covered.
6. For a supported swap, the new asset and change must return under the plan's
   rules. Sending funds to an exchange moves them outside coverage. A trade made
   there does not update this plan or let Pusaka inherit the exchange account.

Example, excluding fees: receive 100 units into Pusaka, spend 30, then receive 20.
The protected balance is now 90. There is no new "set aside for inheritance" step.
If the 20 instead stays in ordinary Paytaca or an exchange, it is not covered.

## Proof of life

| Event | Renews owner activity? | Reason |
|---|---|---|
| Owner-authorized Pusaka payment | Yes | Owner authorization and state update are atomic |
| Supported Pusaka swap | Yes | Only after the adapter proves the same guarantees |
| Owner's standalone check-in | Yes | Explicit, fresh owner authorization |
| Owner changes the family plan | Yes | Authenticated policy change; invalidate old claim approvals |
| Someone sends money to the receive address | No | Otherwise anyone could prevent inheritance indefinitely |
| Wallet connects, app opens or notification is read | No | Not an on-chain owner action |
| A watcher notices a normal Paytaca transaction | No | Observation is not an authorization to update or spend the plan |
| A trusted contact confirms a claim | No | Contact authority is distinct from owner authority |

The manual button is the fallback for an inactive holder. Normal supported use
should do the work. A reminder or relayer can improve convenience, but its failure
must not decide ownership or disable direct owner actions.

## Trusted contacts and claim review

User-facing terms: **Trusted contacts**, **Confirm a claim**, **Review period** and
**Stop this claim**. "Witnesses" and "challenge window" remain technical terms.
Neither the app nor the contacts cryptographically prove someone's death.

- The owner appoints three distinct contact identities; two are needed to start
  an early claim review. They cannot spend the balance or change recipients.
- Contacts can start review before the inactivity period ends. This recovers the
  earlier product's family-assisted route rather than making contacts decorative.
- Inactivity provides a separate route: anyone may start review once the inactivity
  condition is met. Absent contacts must not permanently trap the family funds.
- Both routes require the full configured review delay. Neither goes straight to
  payout. An illustrative production configuration is 180 days of inactivity and
  14 days of review; final presets are a product setting, not a protocol fact.
- The owner can check in, pay or explicitly stop the claim during review. This
  returns the plan to Active and invalidates all approvals from that round.
- After the delay, anyone can submit the required payout to the configured heirs.
  A contact, claimant or fee sponsor cannot substitute another recipient.
- The owner retains authority until payout confirms. At the boundary, a confirmed
  payout and a confirmed owner cancellation compete for the same state; the UI
  must not promise that an unconfirmed cancellation has already stopped a claim.
- A notification is helpful but not guaranteed delivery. Show the on-chain state
  and provide the family a portable plan link or file.

## State transitions

| Current state | Action | Required authority / condition | Result |
|---|---|---|---|
| Active | Send, check in, update policy | Owner | Active, new activity, new round |
| Active | Contact confirmation | A registered contact, once per round | Record one approval; no payout |
| Active | Second distinct confirmation | Contact quorum | Review, with a newly anchored full delay |
| Active | Start after inactivity | Anyone, inactivity elapsed | Review, with a newly anchored full delay |
| Review | Send, check in, stop claim | Owner | Active; invalidate this claim and its approvals |
| Review | Another approval or restart request | Any caller | Cannot restart or shorten the review delay |
| Review | Incoming payment | Any sender | Cannot renew life, cancel review or restart its clock |
| Review | Send to heirs | Anyone, review delay elapsed | Payout to configured heirs |

Owner spending all available funds is valid, subject to the fee and dust rules.
An empty plan must either remain ready to receive or be explicitly closed with a
defined safe receive path. Later transfers, incoming funds during review and
already-issued receive addresses must never create stranded or unprotected coins.
These are required receive-path tests, not post-launch polish.

## Release proof, in order

1. **Wallet benefit:** a real Paytaca-approved partial payment, protected change,
   owner activity update and another payment. Prove receipt into the same coverage
   without another inheritance allocation. Restore the plan in a fresh session.
2. **Family protection:** contact quorum, inactivity-triggered review, owner veto,
   a non-bypassable review delay, then correct multi-heir payout. Use Chipnet before
   any new funded mainnet deployment.
3. **Trading claim:** one named swap, protected returned fungible tokens and correct
   inheritance of those tokens. Until this passes, describe Send/Receive support
   and do not claim that trading is supported.
4. **Presentation:** demonstrate an ordinary payment renewing activity, a false
   claim stopped by the owner, and a valid claim paying the family. Reuse the
   Monad story and prove BCH behavior with transactions and adversarial tests.

If a technical proof fails, record the failure and resolve the architecture or
explicitly revise the product promise. Do not silently remove the wallet benefit
and present the existing savings-plan MVP as equivalent.

The earlier deployed test plan is version 1. Updating these documents or building
version 2 does not upgrade it. Migrating its funds requires the owner's ordinary
wallet approval; no automatic movement is part of this design task.

## Implementation reference

See [DELIVERY.md](DELIVERY.md) for the six work packages, their completion
conditions, the immediate next task and the release boundaries.

See [BCH inheritance wallet architecture](architecture/inheritance-wallet.md) for
the candidate construction, unresolved integration work and proof gates.

The historical source behavior is in
[`PusakaWallet.sol`](https://github.com/astrorehan/pusaka/blob/main/contracts/src/PusakaWallet.sol)
and [`PusakaCore.sol`](https://github.com/astrorehan/pusaka/blob/main/contracts/src/PusakaCore.sol).
EIP-7702's account delegation is specified in the
[EIP](https://eips.ethereum.org/EIPS/eip-7702). BCH's existing locking conditions and
transaction-local context are described in the
[CashScript introduction](https://cashscript.org/docs/basics/about-bch).
