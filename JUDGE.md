# Pusaka: guide for judges

A three-minute read: what Pusaka is, the one-minute judge path, and where to check every claim. Everything else
is in the [README](README.md).

| | |
|---|---|
| **Web app** (Bitcoin Cash mainnet) | https://astrorehan.github.io/pusaka-bch/ |
| **Judge path** (one real mainnet transaction, about a minute, no wallet needed) | https://astrorehan.github.io/pusaka-bch/wallet/demo |
| **The same app on Chipnet** (test network) | https://astrorehan.github.io/pusaka-bch/chipnet/ · [its demo](https://astrorehan.github.io/pusaka-bch/chipnet/wallet/demo) |
| **Presentation** | [Google Slides](https://docs.google.com/presentation/d/1xBfLkjmP-jgbWSFdYGgpf9XMxtuWoqXeuoXi-L64PpE/edit?usp=sharing) ([PDF copy](docs/Pusaka-BCH-BLAZE-2026.pdf)), also linked from the banner at the top of every page of the app |
| **Code now** | [BLAZE release branch](https://github.com/astrorehan/pusaka-bch/tree/release/v2-readiness) |
| **Code before BLAZE** | tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start) and [Pusaka on Monad](https://github.com/astrorehan/pusaka) |
| **Demo before BLAZE** | [pusaka-faraid.vercel.app](https://pusaka-faraid.vercel.app) (the Monad version) |
| **Entered for** | BCH BLAZE 2026 Mainnet Track and the Best SolidCash Application bounty |
| **Prize and donation address** (CashTokens) | `bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux` |

## Pusaka in one minute

**What happens to your BCH when you die?** If nobody has your keys, the coins are lost for good. If somebody has
them, they can take everything today.

Pusaka is a Bitcoin Cash wallet with the inheritance plan built in.

1. **Set it up once.** Name your heirs and their shares (equal, your own split, or Islamic inheritance, faraid),
   three trusted contacts, a waiting time and a review period.
2. **Use it like any wallet.** Send and receive, and swap on Chipnet (mainnet has no qualified pair yet). Every payment you send proves you are still here and
   restarts the waiting time. No reminders to press, unless you go a long time without paying anyone.
3. **If you go quiet,** anyone can open a claim once the waiting time has passed, or two of your three contacts
   can open one sooner. The revised plans enforce the review period even when the owner pays the payout fee.
   **Stop claim**, or a payment you send, ends the claim and returns the plan to active use.
4. **After the review,** anyone can press **Pay the heirs**. When the plan covers the network fee and every heir’s
   minimum payment, a visitor can submit the payout without a wallet.

The same plan covers a lost key: if the owner can no longer sign, two contacts can open a claim, and the coins
reach the people named instead of being lost. A second wallet of the owner's own can be one of them.

No company holds the coins and no server stores the plan. Four [SolidCash](https://solidcash.org) contracts do the
work: the plan ([`PusakaAssetPlan`](contract/contracts/PusakaAssetPlan.scash)) with its state in a CashTokens NFT,
its receive address ([`PusakaV2Inbox`](contract/contracts/PusakaV2Inbox.scash)), the review clock
([`PusakaV2ReviewAnchor`](contract/contracts/PusakaV2ReviewAnchor.scash), a BIP68 relative time lock) and a token vault
([`PusakaTokenVault`](contract/contracts/PusakaTokenVault.scash)) that keeps swapped tokens under the same rules.

## The judge path: one minute, no wallet

| Do this | What you should see |
|---|---|
You play the family of an owner who went quiet. Inheritance takes time by design: a waiting time, then a review
the owner can use to stop the claim. So the demo starts near the end of a real plan, where those steps have
already happened on mainnet, and leaves the last one to you.

| Do this | What you should see |
|---|---|
| Open the [demo](https://astrorehan.github.io/pusaka-bch/wallet/demo) | **Pay out a real inheritance**: what already happened, step by step. *Plan created* and *Claim opened* (each links to its transaction), *Owner went quiet* and *Review ended* (no transaction of their own, just time passing), then **Your turn: pay the heirs** |
| Press **Pay the heirs** | A review sheet listing each of the six heirs by name with their exact amount, then the network fee, paid from the plan. Nothing is sent yet |
| Review the six payments, then press **Send transaction** | "Transaction accepted by the network" with a **View transaction** link. The last step turns into **Heirs paid** |
| Open **View transaction** | One transaction, one output per heir: pot × share ÷ 120, rounded down |
| Press **Open the next example** | Another example plan, one with its payout ready whenever there is one |

Each example pays out once, so the demo keeps a pool of identical ones (four `assets-2` examples, plus six
earlier `assets-1` ones as fallbacks) and opens one that is ready. If two people pay the same example at the
same moment, the network accepts only one payout; the other sees that it was just paid and is offered the next
example. If the review sheet says the plan changed, check it again before sending; if the heirs were already
paid, press **Back** and open the next example. If every example has been paid, the demo says so and links to
the same steps on Chipnet.
[Mainnet example records](docs/proofs/v2-live.md#mainnet)

## The owner path: five minutes, with Paytaca or Cashonize

1. Open [Create a plan](https://astrorehan.github.io/pusaka-bch/new) and connect your wallet with the QR code
   (WizardConnect).
2. Add heirs and their shares, then three trusted contacts. Use ordinary receive addresses (`bitcoincash:q…`).
   Tip: use other receive addresses of your own wallet, and every payout comes back to you.
3. Choose the waiting time and the review period (at least a day each), and a starting amount.
4. Review and approve in your wallet. If your coins are spread over several addresses, press **Prepare wallet**
   first: a separate transaction that gathers them at your first receive address.
5. Save the plan link when the app asks. Then try **Send** (the waiting time moves forward), **Receive** and
   **Collect**, **I'm still here**, **Edit inheritance rules**, and **Take available BCH back** from the
   **⋯** menu.

Every review sheet shows each output and fee before your wallet is asked to sign. The wallet signs only; the app
broadcasts the exact transaction you reviewed and checks its ID.

## The whole cycle yourself: about 30 minutes, on Chipnet

A plan you create on mainnet needs at least a day for each of the waiting time and the review, so that a short
absence never costs an owner their savings. (The demo's examples were made by our script with a 1-minute wait.)
To run every step yourself, use the [quick test plan on Chipnet](https://astrorehan.github.io/pusaka-bch/chipnet/wallet/new?quick=1)
with test BCH from a Chipnet faucet:

1. Create the plan as above, with **Quick test** ticked: a 1-minute waiting time and a 512-second review, the
   shortest the network can enforce.
2. Wait for the waiting time to pass. The network clock moves with each block, so this takes a block or two.
3. Press **Open the claim** on your plan. The review starts once the claim is confirmed in a block.
4. When the review ends, press **Pay the heirs**. One transaction pays every heir.

Expect about 20 to 30 minutes in all, depending on how quickly blocks arrive.

## Transactions you can open

**Revised mainnet review anchor (`assets-2`), 20 November 2026.** The node refused a payout sponsored and
signed by the owner before the review matured. The same owner then stopped the claim and returned the plan
to active use. When a second review matured, a wallet-free transaction paid 887, 4,141 and 2,070 sats to the three heirs.
[New plan](https://explorer.bch.ninja/tx/ce41df221e15a53e98bb9a2f3a827cc522a05d9b382533632a08065cde0660b6) · [Stop claim](https://explorer.bch.ninja/tx/a723442a22bd6037dfba1f1ff7db4f466d522d3120f473df41e33843a7fa74fb) · [Mature payout](https://explorer.bch.ninja/tx/af544d637c5e7d271a6334d53a9b82ae928ab1c0223cac6fd16632fd550bf011) · [Full record](docs/proofs/v2-live.md#revised-review-anchor-assets-2)

**Earlier mainnet release (`assets-1`), 20 November 2026.** The lifecycle used the same transaction builders as the app. The network
refused an early payout with `non-BIP68-final`. The owner stopped that claim. Contacts opened a second review,
then a self-funded transaction paid all three heirs once the anchor matured.

| What happened | Transaction |
|---|---|
| Created the wallet with 20,000 sats | [`c6f33435…eaad`](https://explorer.bch.ninja/tx/c6f33435902959af93d2e557b546a2a58ed8e9b193a418129342f9c23605eaad) |
| Collected 7,600 sats without moving the inactivity deadline | [`091172af…d07d`](https://explorer.bch.ninja/tx/091172af383a4f80ae7caaa9fa5b41be028be0d69d78ea0baca3ccdd0c19d07d) |
| Sent 2,000 sats and renewed the inactivity deadline | [`b15d8470…2c47`](https://explorer.bch.ninja/tx/b15d847046b0ea643e1fa72273b6166e6b53e6260ba195437a9b1eaf00a92c47) |
| The owner stopped the first claim | [`55c065a1…40de`](https://explorer.bch.ninja/tx/55c065a1577a58ad50015f96e285875d239f3bc73e34ba1b6677ce8c5e6640de) |
| Contacts opened a second claim | [`3560d7d3…bf19`](https://explorer.bch.ninja/tx/3560d7d3ec564b201153836ee52e08d9a19ebc0637b85846f2df68b3a331bf19) |
| The mature payout paid wife 2,575, son 12,016 and daughter 6,008 sats | [`ad0e1a36…4689`](https://explorer.bch.ninja/tx/ad0e1a36ddf25e510ecb9901925953007a0d922d3253a220c4d36e1fc7634689) |

The full sequence and six demo plans are in the [mainnet record](docs/proofs/v2-live.md#mainnet).

**Chipnet, 19 November 2026, 15:39 to 16:07 UTC: the whole v2 lifecycle on one plan.** Built by
[`contract/scripts/v2/live.ts`](contract/scripts/v2/live.ts) with the same transaction builders the app uses.
Heirs: wife 3, son 14, daughter 7 (of 24). Review period: 512 seconds.

| What happened | Transaction |
|---|---|
| Wallet created (315 bytes) | [`719ac210…615f`](https://chipnet.chaingraph.cash/tx/719ac210800e80ce27d0f7557d37165f29857bbc7489ef96eb47fe94eba6615f) |
| Someone paid 3,100 sats to its receive address | [`1b67d2e5…5abb`](https://chipnet.chaingraph.cash/tx/1b67d2e56e05240fb1e7ff324908bfa2e926979859cd265e3700e1f5e8235abb) |
| Collected into the plan; the deadline did not move (a receipt is not proof of life) | [`a16c8567…c90b`](https://chipnet.chaingraph.cash/tx/a16c8567566be68be3c5c13625bf853f5986357fbef6b5165900971e7495c90b) |
| The owner sent 1,000 sats; the deadline moved 30 days forward | [`fff02ca0…8c9d`](https://chipnet.chaingraph.cash/tx/fff02ca0aa5302dfce4657f647d87e6a9b815fa976b28df21da26db594818c9d) |
| Contact 1 confirmed (no payout right yet) | [`c42d548c…28b5`](https://chipnet.chaingraph.cash/tx/c42d548c67ea6fb5169af9b71b78d52405c381003f5fc7f63e9f758ad46028b5) |
| Contact 2 confirmed: the claim opened and the review began | [`09e2d830…62e0`](https://chipnet.chaingraph.cash/tx/09e2d8303236ffdf7474cf74d96dc62ed11c4fa5466d827c7c4b9892cb3f62e0) |
| A payout sent at once was **refused by the network**: `non-BIP68-final (code 64)` | (rejected, never mined) |
| The owner stopped the claim; the earlier confirmations no longer count | [`3b84434b…df02`](https://chipnet.chaingraph.cash/tx/3b84434beae5db7f4d2acb653426502ce899586784a8e4c9ce773e8692b3df02) |
| Contacts 2 and 3 confirmed again: a second claim | [`aaa123ba…b1af`](https://chipnet.chaingraph.cash/tx/aaa123ba3a6fc46f8f22a7666bbf51cc421628b410d442315d9a7791afe0b1af), [`b591bb97…3e0f`](https://chipnet.chaingraph.cash/tx/b591bb97b3f488f65f7c0d67e5b93a61c6d17a77bc1d411d987503a12b8f3e0f) |
| After the review, the heirs were paid: wife 887, son 4,141, daughter 2,070 sats | [`c6076a16…65e4`](https://chipnet.chaingraph.cash/tx/c6076a16f29fe42fb7da5187bfab169a457c2110d9656f386a1c1560f6be65e4) |

Every row, with sizes and fees, and the example plans: [`docs/proofs/v2-live.md`](docs/proofs/v2-live.md).

**From the app itself, on a phone.** On 18 November a Paytaca phone, connected over WizardConnect, created a
wallet ([`051af5d7…d9b9`](https://chipnet.chaingraph.cash/tx/051af5d7d96f3777991795511c71fa2d93689a239e6ff879bf1c8af2af5dd9b9)),
refused one send and approved the next ([`b31fe96b…bdb1`](https://chipnet.chaingraph.cash/tx/b31fe96bbe819162b35e62b77e05366fbbedd19aa26a4991f8be7ffdbdc2bdb1)).
On 19 November an example plan was paid to its six heirs by pressing **Pay the heirs** in the app, with no wallet
connected ([`dd572f2a…6bd0`](https://chipnet.chaingraph.cash/tx/dd572f2a005347997d305dde002ddda7f6df465d451a70c029827e11419e6bd0)).

**Tokens.** A swap on a real Cauldron pool put the tokens straight into the plan's token vault, and after a
claim the tokens were paid to the heirs by share
([record](docs/proofs/app-and-assets.md#live-chipnet-evidence): swap
`e2f4f53e…a32b`, token payout `edd44574…5f67`).

**Earlier v1 mainnet proof.** A v1 plan was created in the web app and signed in Paytaca on 17 November.
[`4e5b2fd4…1c3d`](https://explorer.bch.ninja/tx/4e5b2fd4cdb51a96d0ed00c423d8e0a9b5eeabb1c2dfadce4ce3ee8f70911c3d)

## What the network refuses

Each row is checked by a test that builds the attacker's transaction and expects it to fail, under the BCH 2026
limits and a strict BIP68 verifier ([`contract/test/v2/`](contract/test/v2/)).

| Someone tries to | Result | Test |
|---|---|---|
| Pay out one second before the review ends | Refused: the anchor is not old enough | `rejects backdated openClaim locktime, unconfirmed anchor, insufficient MTP shift, and elapsed = delay - 1s` |
| Pay out early with the owner paying the fee on the revised anchor | Refused until BIP68 review matures | `keeps owner cancellation available and applies the same review time to an owner-sponsored payout` |
| Use owner cancellation to produce a paid, stale, or still-approved plan | Refused by the revised anchor | `accepts cancellation only into the next ACTIVE round with cleared approvals` |
| Open a claim with a backdated time, or skip the review with a wrong sequence | Refused | `rejects non-version-2 tx, disabled/height-mode/too-short sequence, and open+finalize in same tx` |
| Swap an heir's address, or use a fake or stale claim marker | Refused | `rejects substituted, plain-BCH, wrong-plan, wrong-round anchors, repeated openClaim, and hijacked payout` |
| Vote twice as the same contact, replay a vote, forge the policy, or skim the receive address | Refused | `rejects all adversarial attack vectors (fee-reserve siphon, contact double-vote/replay, substitution, policy forgery, CLTV bypass, inbox skim)` |
| Stop a claim without being the owner | Refused; the owner's stop works and restarts the clock | `enforces owner cancelClaim (rejects stranger, stops old finalize after delay, restarts fresh round 2 delay, allows ownerWithdraw)` |
| Take part of the fee reserve as change while paying out | Refused | `rejects a caller taking part of the review fee reserve as a self-funded change output` |
| Redirect a payment, forge the state NFT or overcharge a collection | Refused | `rejects adversarial attacks: recipient substitution, container dust violation, backdated locktime regression, forged NFTs, inbox skimming, excessive self-sweep fee, double container merge, and token junk` |
| Swap through a fake pool, or with an expired quote | Refused | `rejects expired quotes, fake pool scripts, zero minimum, wrong network metadata and old BCH-only plans` |

And what must work: a review that both a contact quorum and inactivity must respect, ten heirs at once, money that
arrives after a payout or after the owner left still reaching the heirs, and a fresh browser restoring a plan from
its link. Run them yourself (Node 24):

```sh
cd contract && npm install && npm test     # all contract tests, v1 and v2
cd app && npm install && npm run build && npm run test:ui
```

## Current limits

- **Earlier plan addresses.** The app still opens plans created with the earlier review anchor and labels them.
  Those contracts allow an early payout signed and sponsored by the owner to the registered heirs. The revised
  anchor enforces the delay for owner-sponsored payouts on newly created `assets-2` plans.
- **Token inheritance after taking BCH back.** Token payouts follow a completed BCH payout. If the owner takes
  back the available BCH and leaves tokens in the vault, the plan needs a BCH top-up before the heirs can claim them.

## SolidCash implementation

The wallet integration led to an SDK signing report and a patch for funded split and merge. The upstream issue
includes the stateful signing reproduction. The pull request covers the remaining split and merge paths with
regression tests. [Issue #3](https://github.com/solidcash/solidcash/issues/3) · [Pull request #7](https://github.com/solidcash/solidcash/pull/7)

| Feature | Where it runs |
|---|---|
| Stateful Solidity-style contract with structs, state variables, events and modifiers | [v1 plan](contract/contracts/Pusaka.scash) |
| Input and output introspection, NFT state transitions, policy hashing and a bounded payout loop | [v2 asset plan](contract/contracts/PusakaAssetPlan.scash) |
| Time-based BIP68 review and cancellation that advances the round and clears approvals | [Review anchor](contract/contracts/PusakaV2ReviewAnchor.scash) |
| Contract co-spends that bind receipts and token distributions to a plan | [Receive inbox](contract/contracts/PusakaV2Inbox.scash) and [token vault](contract/contracts/PusakaTokenVault.scash) |

## Before and after BLAZE

BLAZE hacking started on **14 Nov 2026, 14:00 UTC**.

**Before** (made earlier, declared here):

- **Pusaka on Monad**, an earlier hackathon entry: [code](https://github.com/astrorehan/pusaka) (last commit
  24 Oct 2026) and [demo](https://pusaka-faraid.vercel.app). Solidity contracts, a faraid calculator and the
  flower logo. The same idea on an EVM chain: an EIP-7702 wallet the owner keeps using, 2 of 3 witnesses or
  12 months of inactivity to trigger, a challenge window that any sign of life cancels, then a faraid payout.
  It ran on Monad testnet only.
- **This repository at tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start)** (commit
  `8b59ba5`, 14 Nov 02:30 UTC): a README, the licence and `prototype/`, a CashScript covenant with a 12-case test
  that ran only in a simulator.
- **Preparation notes** in [`Preparation/`](Preparation/), committed at 14:28 UTC on 14 Nov; no code.

**Reused from before:** the product design (a wallet you keep using, witnesses, a challenge window, a faraid
payout), the faraid rules and the flower logo. None of its contracts run on Bitcoin Cash: BCH has no EIP-7702 and
no accounts, so every part below was built again for UTXOs during BLAZE.

**Built during BLAZE** (every commit after `blaze-start`):

| What | Where |
|---|---|
| The first SolidCash plan contract (v1: create, I'm still here, take back, send to heirs), its Chipnet lifecycle and a mainnet plan created in Paytaca | [`contract/contracts/Pusaka.scash`](contract/contracts/Pusaka.scash) |
| The v2 wallet contracts: spendable balance, receive address, trusted contacts, the BIP68 review, token vault and Cauldron swaps | [`contract/contracts/`](contract/contracts/) |
| The tests for all of them | [`contract/test/`](contract/test/) |
| A fix to the SolidCash SDK so a wallet can sign stateful calls | [`contract/patches/`](contract/patches/) |
| The web app: landing, How it works, wallet, setup, inheritance, swap, WizardConnect | [`app/`](app/) |
| The live runner and its records | [`contract/scripts/v2/`](contract/scripts/v2/) |
| Design rules, UX notes, the SolidCash developer log and feedback | [`docs/`](docs/) |

Check it: `git diff --stat blaze-start HEAD`.

## If something doesn't work

| Problem | What to do |
|---|---|
| An input was spent during review | Press **Refresh transaction review** to prepare from the current state. In the demo, you can also open the next example |
| The broadcast reply was lost during setup or a rules edit | Open **Recover a plan** in the wallet and press **Check submission**. The app keeps the recovery file while the network status is uncertain |
| "The network clock has not reached this step yet." | The network's clock runs behind real time. Wait a few minutes and press **Refresh** |
| "Could not reach the Bitcoin Cash network." | The app could not reach a public BCH server. Press **Refresh** |
| A **Testnet** badge at the top | You are in the Chipnet app. The mainnet app is at the site root |
| The wallet does not connect | Use Paytaca, or Cashonize 0.9.0 or later, on the same network as the app, and scan the QR code |
| "Cancelled in your wallet. Nothing was sent." | You declined in the wallet. Press the button again |
| **Collect** asks your wallet to approve | A single small payment cannot pay its own fee under the contract's cap, so your wallet pays it and the plan keeps every satoshi received |

## Good to know

- **Keep the plan link.** Every claim and payout needs the plan's rules, which travel in the link after the `#`
  and never reach a server. Pusaka keeps no copy. The BCH stays safe in the contracts without the link, but
  nobody can act on it.
- **Fees.** Opening a claim and paying the heirs each cost about 4,000 to 5,000 satoshis, taken from the plan.
  Owner actions cost a similar fee from the owner's wallet or the plan. Pusaka takes no fee of its own today.
- **The network clock runs about an hour behind.** Plans follow the median time of the last 11 blocks, so every
  date in the app says "about".
- **Up to 10 heirs**, each with an ordinary BCH address, and each share at least 546 satoshis when paid.
- **Faraid is worked out in the browser.** The contracts enforce the resulting numbers, not the rules of faraid.
- **It is not a legal will.** It moves only the BCH and tokens held by the plan.
- More: [README](README.md), the [design rules](docs/DESIGN.md), the
  [SolidCash developer log](docs/solidcash-dx-log.md) and the [feedback for SolidCash](docs/solidcash-feedback.md).
