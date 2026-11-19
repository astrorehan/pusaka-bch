# Pusaka: guide for judges

A three-minute read: what Pusaka is, the one-minute judge path, and where to check every claim. Everything else
is in the [README](README.md).

| | |
|---|---|
| **Web app** (Bitcoin Cash mainnet) | https://astrorehan.github.io/pusaka-bch/ |
| **Judge path** (one button, a real transaction, no wallet needed) | https://astrorehan.github.io/pusaka-bch/wallet/demo |
| **The same app on Chipnet** (test network) | https://astrorehan.github.io/pusaka-bch/chipnet/ · [its demo](https://astrorehan.github.io/pusaka-bch/chipnet/wallet/demo) |
| **Presentation** | Linked from the banner at the top of every page of the app |
| **Code now** | https://github.com/astrorehan/pusaka-bch (`main`) |
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
2. **Use it like any wallet.** Send, receive and swap. Every payment you send proves you are still here and
   restarts the waiting time. No reminders to press, unless you go a long time without paying anyone.
3. **If you go quiet,** anyone can open a claim once the waiting time has passed, or two of your three contacts
   can open one sooner. The network then enforces a review period. One tap on **Stop claim**, or any payment you
   send, ends the claim.
4. **After the review,** anyone can press **Pay the heirs**. One transaction pays every heir their exact share,
   and the plan pays the network fee, so an heir with no BCH can still collect.

No company holds the coins and no server stores the plan. Four [SolidCash](https://solidcash.org) contracts do the
work: the plan ([`PusakaAssetPlan`](contract/contracts/PusakaAssetPlan.scash)) with its state in a CashTokens NFT,
its receive address ([`PusakaV2Inbox`](contract/contracts/PusakaV2Inbox.scash)), the review clock
([`PusakaV2Anchor`](contract/contracts/PusakaV2Anchor.scash), a BIP68 relative time lock) and a token vault
([`PusakaTokenVault`](contract/contracts/PusakaTokenVault.scash)) that keeps swapped tokens under the same rules.

## The judge path: one minute, no wallet

| Do this | What you should see |
|---|---|
| Open the [demo](https://astrorehan.github.io/pusaka-bch/wallet/demo) | A live example plan whose owner has gone quiet: six named heirs (a faraid family), three contacts, and a banner saying what anyone can do next |
| The banner says **The review period has ended**: press **Pay the heirs** | A review sheet listing each heir by name with their exact amount, then the network fee, paid from the plan. Nothing is sent yet |
| Press **Send transaction** | "Transaction accepted by the network" with a **View transaction** link. The plan now shows **Paid to heirs** |
| Open **View transaction** | One transaction, one output per heir: pot × share ÷ 120, rounded down |
| If the banner says **The owner has been inactive past the deadline** instead, press **Open the claim**, then **Send transaction** | The claim opens and the review period starts. A few minutes later the banner offers **Pay the heirs** |
| Open the demo again | The next example plan with something left to do |

The demo picks whichever example plan has the most to do: a payout that is ready, then a claim anyone can open,
then one still under review. The example plans and their transactions are listed in
[`docs/proofs/v2-live.md`](docs/proofs/v2-live.md). If every mainnet example has been used, the page links to the
same demo on Chipnet.

## The owner path: five minutes, with Paytaca or Cashonize

1. Open [Create a plan](https://astrorehan.github.io/pusaka-bch/new) and connect your wallet with the QR code
   (WizardConnect).
2. Add heirs and their shares, then three trusted contacts. Any BCH addresses work. Tip: use other receive
   addresses of your own wallet, and every payout comes back to you.
3. Choose the waiting time and the review period (at least a day each), and a starting amount.
4. Review and approve in your wallet. If your coins are spread over several addresses, press **Prepare wallet**
   first: a separate transaction that gathers them at your first receive address.
5. Save the plan link when the app asks. Then try **Send** (the waiting time moves forward), **Receive** and
   **Collect**, **I'm still here**, **Edit inheritance rules**, and **Take available BCH back** from the
   **⋯** menu.

Every review sheet shows each output and fee before your wallet is asked to sign. The wallet signs only; the app
broadcasts the exact transaction you reviewed and checks its ID.

## Transactions you can open

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

**Mainnet.** The app at the site root runs on mainnet. On 17 November an earlier (v1) plan was created there in
the web app and signed in Paytaca:
[`4e5b2fd4…1c3d`](https://explorer.bch.ninja/tx/4e5b2fd4cdb51a96d0ed00c423d8e0a9b5eeabb1c2dfadce4ce3ee8f70911c3d).
The mainnet example plans for the judge path, and their transactions, are in
[`docs/proofs/v2-live.md`](docs/proofs/v2-live.md#mainnet).

## What the network refuses

Each row is checked by a test that builds the attacker's transaction and expects it to fail, under the BCH 2026
limits and a strict BIP68 verifier ([`contract/test/v2/`](contract/test/v2/)).

| Someone tries to | Result | Test |
|---|---|---|
| Pay out before the review period ends, by one second | Refused: the anchor is not old enough | `rejects backdated openClaim locktime, unconfirmed anchor, insufficient MTP shift, and elapsed = delay - 1s` |
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

## Before and after BLAZE

BLAZE hacking started on **14 Nov 2026, 14:00 UTC**.

**Before** (made earlier, declared here):

- **Pusaka on Monad**, an earlier hackathon entry: [code](https://github.com/astrorehan/pusaka) (last commit
  24 Oct 2026) and [demo](https://pusaka-faraid.vercel.app). Solidity contracts, a faraid calculator and the
  flower logo. It was a time-locked vault on an EVM chain: no spending, no contacts, no review period.
- **This repository at tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start)** (commit
  `8b59ba5`, 14 Nov 02:30 UTC): a README, the licence and `prototype/`, a CashScript covenant with a 12-case test
  that ran only in a simulator.
- **Preparation notes** in [`Preparation/`](Preparation/), committed at 14:28 UTC on 14 Nov; no code.

**Reused from before:** the product idea, the faraid rules, and the flower logo.

**Built during BLAZE** (every commit after `blaze-start`):

| What | Where |
|---|---|
| The first SolidCash plan contract (v1: create, I'm still here, take back, send to heirs), its Chipnet lifecycle and a mainnet plan created in Paytaca | [`contract/contracts/Pusaka.scash`](contract/contracts/Pusaka.scash) |
| The v2 wallet contracts: spendable balance, receive address, trusted contacts, the BIP68 review, token vault and Cauldron swaps | [`contract/contracts/`](contract/contracts/) |
| The tests for all of them | [`contract/test/`](contract/test/) |
| A fix to the SolidCash SDK so a wallet can sign stateful calls, reported upstream | [`contract/patches/`](contract/patches/), [issue #3](https://github.com/solidcash/solidcash/issues/3) |
| The web app: landing, How it works, wallet, setup, inheritance, swap, WizardConnect | [`app/`](app/) |
| The live runner and its records | [`contract/scripts/v2/`](contract/scripts/v2/) |
| Design rules, UX notes, the SolidCash developer log and feedback | [`docs/`](docs/) |

Check it: `git diff --stat blaze-start HEAD`.

## If something doesn't work

| Problem | What to do |
|---|---|
| "Another transaction just used this plan. Refresh it and try again." | Another judge pressed the same button a moment earlier. Open the demo again for the next example plan |
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
