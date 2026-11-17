# BCH inheritance wallet architecture

17 November 2026. Original architecture selection and proof requirements.
The resulting v2 implementation is described in [the plan format](pusaka-v2-plan-format.md)
and [the verification record](../proofs/pusaka-v2-corrections.md). The candidate
constructions below preserve the reasoning and do not replace that current evidence.
Product requirements are in [PRODUCT.md](../PRODUCT.md). The current app and asset
release are recorded [here](../proofs/app-and-assets.md); the constructions below
retain the original design investigation.

## Constraints and existing evidence

- The existing SolidCash contract has a shared deadline, fixed multi-heir payout
  and owner authorization through a co-spent ordinary P2PKH coin.
- Paytaca mobile approved a mainnet plan creation through the current WizardConnect
  bridge. The offline relay serialization tests pass. A complete new wallet flow
  has not been tested in Paytaca; creation is not proof of every signing capability.
- `@wizardconnect/dapp` in this app exposes transaction signing, not a portable
  arbitrary-message signing method. The protocol's optional extension mechanism
  does not imply Paytaca implements a proposed check-in or contact-signature API.
- The SDK uses state NFTs and separate balance containers. Its deployed target
  address and logical BCH balance are not interchangeable. A "Receive" button
  cannot simply expose `getAddress()` and assume arbitrary deposits become balance.
- Normal Paytaca coins have fixed P2PKH spending conditions. No monitor, pre-signed
  timer or xpub access changes their authorization rules. Avoid stale pre-signed
  transaction schemes that fail when the owner spends their inputs.

## Candidate construction

Use an inheritance-aware BCH balance controlled by a single authenticated plan
state. Keep Paytaca as the owner key holder; Pusaka builds the transactions and
never requests a mnemonic or stores an owner spending key.

1. A unique plan identity authenticates the current policy and state. Balance
   containers and any receive/inbox covenant must require that identity, the
   correct successor state and conservation of value. A matching token category
   alone is insufficient if unrelated NFTs or extra minting authority can forge
   the expected state role.
2. `send(destination, amount)` requires fresh owner authorization. It reduces the
   logical balance by the approved payment and fees, preserves protected change
   and updates owner activity in the same transaction. It must work repeatedly.
3. `checkIn()` is the small standalone owner transaction. Both it and `send`
   clear a pending claim and advance a round identifier. Require timestamp-based
   locktime, a non-final sequence and a non-decreasing deadline when using the
   existing absolute-deadline design; the caller-supplied locktime is not a trusted
   wall clock. The client uses fresh network time; stale authorization must not
   become a reusable future cancellation.
4. A receive covenant or inbox accepts ordinary payments and binds them to this
   plan. The selection must prove independent incoming UTXOs, protected change,
   multiple deposits, dust, fresh-session discovery and post-claim receipts. If
   sweeping is necessary, it must not depend on a dead owner's signature. Do not
   assume an SDK method named deposit solves arbitrary incoming payments.
5. Each contact has a configured identity. A transaction authorized by a contact
   records one approval for this plan, policy version and activity round. Distinct
   contacts count once. The quorum creates a Review state. An expired inactivity
   condition may also create Review without contact cooperation.
6. Only after the complete review delay may an unrestricted submitter request the
   predetermined payout. Owner cancellation spends the same authenticated claim
   state, so its invalidation is enforced by consensus rather than an app flag.

Keep the current `Pusaka.scash` and existing plan links readable as v1. Build v2 as
a separate artifact and explicit plan version. Do not reuse the old artifact for
a new policy or imply funded contracts are upgradeable.

## Two immediate engineering gates

### A. Prove the wallet benefit before changing the screens

Start with a minimal partial-payment contract, the real SDK and the current
external signer. Exercise: fund, pay part, retain change, receive again, pay again,
and recover the plan from a new session.

The present owner-co-spend pattern is a candidate authorization path because it
uses ordinary wallet signing. Prove the required owner input and its change,
including the case where nearly all owner funds are in Pusaka. Do not require a
surprising second top-up before each payment. A small persistent owner coin or a
different supported authorization route must have explicit fee accounting.

Gate A passes only when funds remain covered after partial spending, new receipts
have an enforceable claim path, and the real Paytaca request is understandable.
A simulator-only send is useful evidence but does not pass the wallet gate.

### B. Anchor the review delay to the actual claim transition

Do not implement `reviewEndsAt = tx.locktime + reviewPeriod` as the only protection.
A hostile claimant can choose an old locktime, allowing a newly opened review to
appear already finished. `tx.time` constrains the spending transaction's locktime;
it does not supply an incorruptible "now" to store in state.

Preferred candidate: create a dedicated authenticated claim UTXO on entry to
Review. Finalization must consume it with a consensus-enforced relative time lock
(`OP_CHECKSEQUENCEVERIFY`, transaction version 2, time-based BIP68 encoding). The
delay starts from that newly created output's chain age. Round the configured
duration upward to 512-second units and explain network-time approximation.

Require the specific claim anchor and reject substitutes. Owner cancellation
consumes or invalidates it. Unauthenticated deposits and repeated votes must not
recreate it, restart its age or advance the round. If the normal SDK state update
always recreates the relevant UTXO, a separate claim covenant is necessary. Incoming
funds during Review must either join without changing the anchor or remain in a
safe inbox claimable by the same heirs; they must not need owner consent to join.

The compiler, SDK input sequence handling, output identity and full transaction
limits need an executable proof. The CashScript documentation currently notes a
time-based sequence limitation in its transaction builder. Do not assume that
language support alone proves the installed SolidCash path can build it. If it
cannot, investigate a small dedicated covenant and lower-level builder; do not
replace a seconds-based duration with a block count without revisiting semantics.

## Authorization and convenience options

Contact co-spend transactions can use ordinary wallet approvals, like the current
owner path, subject to proving the contact is the authorized input in the relevant
method. There is no need to invent a portable message API for the first version.

`checkDataSig` makes signed statements a possible later construction on BCH. It
does not make EIP-712 or WebAuthn signatures drop-in replacements. Prove the exact
digest, signature format and wallet capability. Bind any signed message to the
network, unique plan, policy version, action, activity round or claim identity and
freshness condition. Reject a pre-claim message used to cancel a later claim.

Relayers can pay fees and submit authorized actions. They must have no authority
to redirect funds, fabricate life proofs or be required for the owner to stop a
claim. Notifications and indexing may use a service, with direct chain access and
portable plan data as fallback. "No server" is not a reason to remove useful UX.

Passkey support needs a separate signature-verification and key-recovery design.
Browser biometrics alone are not a BCH-verifiable owner authorization. Keep it
outside the initial wallet proof rather than presenting a server decision as
equivalent to the earlier on-chain passkey verification.

## Assets and trading

The first wallet proof is BCH. A trading demonstration additionally needs one
named adapter and fungible CashToken containers whose balances can be distributed
under the same family policy. Token category, returned amount, protected change,
slippage limits, fee payer and recipient must be bound into the approved transaction.

An asset sitting in a pool, an order, a lending position or a custodial exchange is
not automatically in the inheritable balance. Supporting positions requires a
proved redemption/claim adapter, not just displaying their market value. Nonfungible
assets require an explicit recipient rule; a percentage split cannot divide an NFT.

## Required adversarial checks

- Stranger cannot send, check in, change the policy or cancel a claim.
- Wrong or fabricated plan NFT cannot authorize balance spending or a receive sweep.
- Payee substitution, excessive fees and unprotected change are rejected.
- Incoming funds, repeated votes and self-transfers without owner authorization
  cannot renew life or indefinitely delay a valid claim.
- Same contact twice, another plan's approval and a previous round's approval do
  not satisfy the quorum.
- Backdated opening locktime, same-transaction opening/finalization, wrong anchor,
  disabled/wrong-unit sequence and early finalization cannot bypass the review delay.
- An owner action invalidates the old anchor and all old approvals; an old message
  cannot stop a later claim.
- Concurrent owner and payout submissions resolve through the authenticated state;
  neither UI assumes success before chain confirmation.
- Every heir gets the configured share of the latest covered balance; rounding,
  token amounts, carrier values, dust and fee reserves are accounted for.
- Empty balances, deposits during Review and deposits after a payout have defined,
  recoverable spending paths. No old receive address strands future funds.
- Lost relay session and a fresh browser can recover the same plan using public
  metadata and the owner's wallet, without storing a private spending key.

## Sources

- [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702): delegation changes account code
  on supporting EVM chains; it is not a BCH wallet feature.
- [BCH model](https://cashscript.org/docs/basics/about-bch) and
  [covenants](https://cashscript.org/docs/design/covenants): spending conditions,
  introspection and constrained change outputs.
- [Time locks](https://cashscript.org/docs/language/globals): `tx.time`,
  `tx.locktime`, `this.age`, sequence encoding and builder limitations.
- [Signature checks](https://cashscript.org/docs/language/functions): transaction
  signatures and `checkDataSig` are separate verification mechanisms.
- [WizardConnect protocol](https://docs.riftenlabs.com/wizardconnect/protocol/) and
  [extensions](https://docs.riftenlabs.com/wizardconnect/extensions/): transaction
  signing is the base interaction; extra capabilities require wallet support.
