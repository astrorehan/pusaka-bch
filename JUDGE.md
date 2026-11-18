# Pusaka: guide for judges

**18 November wallet release:** [open the live Chipnet proof wallet](https://astrorehan.github.io/pusaka-bch/wallet/demo).
The working app has owner and family flows, contact review and a Cauldron V0 swap
whose token return remains inheritable. [Current evidence](docs/proofs/app-and-assets.md)
includes accepted swap, mature BCH claim and exact fungible token payout IDs.
[Demo guide](docs/demo-guide.md). Real phone signing and v2 mainnet qualification
are still pending. The following older receipts describe the v1 milestone.

A 3-minute read: what Pusaka does, what to press, and where to check each claim. Everything else is in the
[README](README.md).

| | |
|---|---|
| **Web app** | [Chipnet app](https://astrorehan.github.io/pusaka-bch/wallet/demo) |
| **Judge path** (one button, a real transaction) | [Live public proof plan](https://astrorehan.github.io/pusaka-bch/wallet/demo) (read-only; different owner) |
| **Demo video** | **TODO (owner): video link, or delete this row** (BLAZE does not require a video) |
| **Presentation** (Widget Factory) | **TODO (owner): deck link** |
| **Code now** | https://github.com/astrorehan/pusaka-bch |
| **Code before BLAZE** | tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start) and [Pusaka on Monad](https://github.com/astrorehan/pusaka) |
| **Demo before BLAZE** | [pusaka-faraid.vercel.app](https://pusaka-faraid.vercel.app) (the Monad version) |
| **Entered for** | BCH BLAZE 2026 Mainnet Track and the Best SolidCash Application bounty |
| **Prize and donation address** (CashTokens) | `bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux` |

> **Status on 17 Nov 2026:** the whole plan lifecycle has run on **Chipnet**, the BCH test network. A plan has
> also been created on **mainnet** in the web app, signed in Paytaca ([transactions below](#transactions-you-can-open)).
> Mainnet check-in, take back, and payout still need to be verified.

## Pusaka in one minute

**What happens to your BCH when you die?** If nobody has your keys, the coins are lost for good. If somebody has
your keys, they can take everything today.

Pusaka lets you decide now who gets your BCH:

1. You name your heirs and their shares: equal, your own percentages, or Islamic inheritance (faraid). You choose
   a waiting time, for example one year, and move the BCH into the plan.
2. Now and then you press **I'm still here**. That starts the waiting time again. You can take your BCH back at
   any time.
3. If you stop and the waiting time passes, anyone with the plan link can press **Send to heirs**. One transaction
   pays every heir their share. The contract refuses any other split.

No company holds the coins and no server stores the plan. The coins sit in a SolidCash contract on Bitcoin Cash.
The plan link carries what is needed to find the plan again (heirs, shares, waiting time) after the `#` in the URL,
a part browsers never send to a server.

The only BCH tool for this we found is [Last Will](https://github.com/KarolTrzeszczkowski/Electron-Cash-Last-Will-Plugin)
(2019): one heir, through an Electron Cash desktop plugin. Pusaka handles a whole family, in the browser, with any
split.

Faraid comes last, as proof: it is the hardest common split (many heirs, fixed fractions, rules that exclude some
relatives). If Pusaka handles it, it handles any family, and it serves Muslim families that no BCH tool serves today.

Pusaka started as a Solidity app on Monad. SolidCash let the same Solidity-style contract run on BCH: a `struct`
per heir, a state array, a `modifier`, events and a custom error, in 63 lines
([`contract/contracts/Pusaka.scash`](contract/contracts/Pusaka.scash)). Time is counted in seconds, never in blocks,
so the [one-minute blocks planned for May 2027](https://bitcoincashnode.org/en/newsroom/2026-11-14_opinion_on_faster_blocktime)
do not shorten anyone's waiting time.

## Try it: the judge path (about 2 minutes)

You need a BCH wallet with WizardConnect, **Paytaca** or **Cashonize** (0.9.0 or later), holding at least
18,000 satoshis (about 0.00018 BCH). Pressing "Send to heirs" costs you the network fee, about 12,000 satoshis.
The heirs' shares come from the plan, not from your wallet.

> **TODO (owner):** walk this table on the hosted mainnet build, once with Paytaca and once with Cashonize, and fix
> any row that differs. Today the demo plans in `app/src/screens/plan/demoPlan.ts` are placeholders, so `/try`
> cannot find a plan on the network yet.

| Do this | What you should see |
|---|---|
| Open the app and press **Try it now** (or open `/try`) | An example plan whose waiting time has passed: "Ready to send to heirs" in a full green ring, "6 heirs can receive now", and each heir with their faraid share and amount |
| Press **Send to heirs** | A review sheet. "From the plan": every heir and the amount they get. "From your wallet": the network fee. Nothing is sent yet |
| Press **Connect wallet** in the sheet and scan the QR code with your wallet | The button in the sheet turns into **Send to heirs** |
| Press **Send to heirs** and approve in your wallet | "Waiting for your wallet…", then "Sending…". Your wallet may ask twice: first to gather your coins at one address, then for the payout |
| Wait a few seconds | "Sent to heirs": each heir shows a check and their amount, and a **View on explorer** link appears |
| Open **View on explorer** | One transaction with one output per heir, each `pot × share ÷ 120`, rounded down |
| Open `/try` again | The next example plan that is still unpaid. Once all are paid: "This example was already sent" |

To see the owner's side, make your own plan at `/new` (three steps), then open its plan link.

## Transactions you can open

Every link opens a public Chipnet explorer. Chipnet coins have no value. Sizes and fees are as the explorer shows them.

**15 Nov 2026, about 06:51 to 06:54 UTC.** The whole lifecycle, run by a script that holds the keys
(`contract/scripts/chipnet-flow.ts`, **TODO (owner): commit this script; it is not in the repo yet**).

| Network | What happened | Transaction | Size |
|---|---|---|---|
| Chipnet | Plan A created: 20,000 sats, 6 heirs | [`99386696…c38d`](https://chipnet.imaginary.cash/tx/993866968a678b289f1b2a9a5cd0f779f8114c8ea333a4cf7b4d519b7704c38d) | 952 bytes |
| Chipnet | Owner pressed I'm still here: the deadline moved to the locktime + 30 days | [`73dabfc1…2a12`](https://chipnet.imaginary.cash/tx/73dabfc17d3804fb6a6351a60885a07764c0cf0075fbd2d86c0195c3e34f2a12) | 9,209 bytes |
| Chipnet | Owner took the BCH back | [`f3224bea…a439`](https://chipnet.imaginary.cash/tx/f3224bea4dc84c83ac3cd37e678b8088df4c85ab364e2895d853e7308df4a439) | 9,085 bytes |
| Chipnet | Plan B created with its deadline an hour behind the network clock: 60,000 sats | [`3cb2d009…956d`](https://chipnet.imaginary.cash/tx/3cb2d009d793c3e4bc75c14228461f61a60ea7fb3fd8099c0de01f604ad4956d) | 952 bytes |
| Chipnet | Plan B sent to all 6 faraid heirs in one transaction | [`d76ffee1…25ad`](https://chipnet.imaginary.cash/tx/d76ffee1296a7d11cc94719e696ed57cdd8781a1389f7fda71eaa66ad48e25ad) | 11,896 bytes, 16 inputs, 17 outputs, fee 12,086 sats |

**16 Nov 2026, about 03:16 to 03:28 UTC.** The same lifecycle, with every key held by a stand-in wallet that signs
only what the `bch_signTransaction` request hands it, the request WizardConnect carries
([`contract/scripts/external-signing-spike.ts`](contract/scripts/external-signing-spike.ts)). This is a Node script,
not a phone wallet.

| Network | What happened | Transaction | Size |
|---|---|---|---|
| Chipnet | I'm still here (the deadline moved by exactly the waiting time); the wallet signed 1 of 3 inputs | [`cf6ffd83…1c80`](https://chipnet.imaginary.cash/tx/cf6ffd83dc7fed321ed158ad40416dec90b2c176c6429233dab40b95e0381c80) | 9,209 bytes |
| Chipnet | Take my BCH back; the wallet signed 1 of 3 inputs | [`62dfa7e0…3d1a`](https://chipnet.imaginary.cash/tx/62dfa7e0e090357643fcf6e832bfdcbeb2669dd0360150cf46adaec711793d1a) | 9,085 bytes |
| Chipnet | Send to 6 heirs, paid by a stranger's wallet; the wallet signed 11 of 16 inputs | [`187ac296…a90c`](https://chipnet.imaginary.cash/tx/187ac29671c0c75ff40fdf9ab0ceb421f3e08e53e9167173402b62290d13a90c) | 11,896 bytes |

In both payouts, outputs #3 to #8 are the six heirs: 7,250, 9,666, 9,666, 12,566, 12,566 and 6,283 sats. That is
58,000 × 15, 20, 20, 26, 26 and 13 ÷ 120, rounded down (60,000 in the plan minus a 2,000-sat fee budget).

**Mainnet.** On 17 Nov 2026, a plan was created in the web app and signed in Paytaca on a phone. Its on-chain state
holds 11,000 sats: 10,000 for one test heir (100%) and a 1,000-sat reserve, with a one-day waiting time. The creation
transaction is 755 bytes and paid a 1,755-sat network fee. The remaining rows still need real transactions.

| Network | What happened | Transaction |
|---|---|---|
| Mainnet | Example plan for `/try` created | TODO (owner) |
| Mainnet | Example plan sent to its heirs from `/try` | TODO (owner) |
| Mainnet | A plan created in the app, signed in Paytaca | [`4e5b2fd4…1c3d`](https://explorer.bch.ninja/tx/4e5b2fd4cdb51a96d0ed00c423d8e0a9b5eeabb1c2dfadce4ce3ee8f70911c3d) |
| Mainnet | I'm still here, signed in the wallet | TODO (owner) |
| Mainnet | Take my BCH back, signed in the wallet | TODO (owner) |

## The attack table

Each row is a test that builds the attacker's transaction and checks that it is refused. The tests run in SolidHat
against the real BCH 2026 limits (10,000-byte inputs, dust enforced; see
[`contract/solidcash.config.ts`](contract/solidcash.config.ts)).

**The contract the app uses** ([`Pusaka.scash`](contract/contracts/Pusaka.scash), tests in
[`contract/test/Pusaka.test.ts`](contract/test/Pusaka.test.ts)):

| An attacker tries to | The contract | Test |
|---|---|---|
| Press I'm still here for the owner, to keep the heirs waiting | Refuses: the owner's own coin must be spent in the same transaction | `a stranger cannot check in` |
| Take the BCH back | Refuses with the same owner check | `only the owner can withdraw, and withdraw empties the vault` |
| Pay out before the waiting time ends | Refuses: the transaction's time must be at or past the deadline | `nobody can distribute before the deadline` |
| Pay out after the first deadline, though the owner pressed I'm still here on day 29 | Refuses: the check-in moved the deadline a full period forward | `a check-in after 29 days keeps the heirs waiting another full period` |
| Move 1 satoshi from the daughter to the wife | Refuses: each heir's output must match `pot × share ÷ total` | `rejects a payout that moves 1 satoshi from the daughter to the wife` |
| Swap an heir's address for their own | Refuses | `rejects a payout to a stranger instead of an heir` |
| Make a plan with 11 heirs, more than the 10 payout slots | Refuses at creation (`1 to 10 heirs`) | `refuses a vault with 11 heirs` |

The honest path is tested too: `after the deadline anyone pays all 6 faraid heirs in one transaction` (checks each
heir's balance to the satoshi) and `pays 10 heirs (the maximum) in one transaction`.

**The stateless fallback** ([`VaultStateless.scash`](contract/contracts/VaultStateless.scash), the pre-BLAZE
prototype ported to SolidCash; the app does not use it), tests in
[`contract/test/VaultStateless.test.ts`](contract/test/VaultStateless.test.ts):

| An attacker tries to | The contract | Test |
|---|---|---|
| Add an extra output that pays themselves | Refuses: exactly one output per heir | `rejects distribute with an extra output to a stranger` |
| Take a little out while the owner checks in | Refuses: the plan's balance may not shrink | `rejects owner check-in that shrinks the vault` |
| Withdraw with their own coin | Refuses: input 1 must be the owner's coin | `rejects withdraw by a stranger` |
| Pay out right after a check-in | Refused by the network: the check-in re-created the plan's coin, so its age starts again at zero | `rejects distribute right after a check-in (the timer was reset)` |

Run them yourself (Node 24):

```sh
cd contract && npm install && npm test     # "Test Files 2 passed", "Tests 25 passed"
cd prototype && npm install && npm test    # 12 lines, each starting with PASS
```

Both results were checked on 16 Nov 2026 (Node 24.11, Windows 11).

## Before and after BLAZE

BLAZE hacking started on **14 Nov 2026, 14:00 UTC**.

**Before** (made earlier, declared here):

- **Pusaka on Monad**, an earlier hackathon entry: [code](https://github.com/astrorehan/pusaka) (last commit
  24 Oct 2026) and [demo](https://pusaka-faraid.vercel.app). Solidity contracts (`PusakaVault.sol`, `FaraidLib.sol`
  and others), a faraid calculator, the flower logo. Indonesia-specific parts (rupiah, bank payout) are not carried over.
- **This repo at tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start)** (commit `8b59ba5`,
  14 Nov 02:30 UTC): `README.md`, `LICENSE` and `prototype/`, a CashScript covenant with a 12-case test that ran
  only in a simulator.
- **Preparation notes** in [`Preparation/`](Preparation/): plans and research as they stood at the start. They were
  committed at 14:28 UTC on 14 Nov (`2decf57`); they contain no code.

**Reused from before:** the product idea, the faraid rules, and the flower logo (files added to [`brand/`](brand/)
on 15 Nov). The TypeScript faraid calculator ([`app/src/screens/create/faraid.ts`](app/src/screens/create/faraid.ts))
was committed during BLAZE (`628b9a3`). **TODO (owner): say here whether it was ported from the Monad code or
written fresh.**

**Built during BLAZE** (every commit after `blaze-start`):

| What | Where | When |
|---|---|---|
| The stateful SolidCash contract and its 11 tests | `contract/contracts/Pusaka.scash`, `contract/test/Pusaka.test.ts` | 15 Nov (`0a788a8`) |
| The prototype ported to SolidCash, with 14 tests (one new: a check-in really resets the timer) | `contract/contracts/VaultStateless.scash`, `contract/test/VaultStateless.test.ts` | 15 Nov (`0a788a8`) |
| The lifecycle on Chipnet, 8 transactions | [table above](#transactions-you-can-open) | 15 and 16 Nov |
| A fix to the SolidCash SDK so a wallet can sign stateful calls | `contract/patches/`, `app/patches/` | 16 Nov (`3377b01`) |
| The web app: home, How it works, create a plan, plan page, judge path, plan link, WizardConnect | `app/` | 16 Nov (`fe6ab24` to `9ec8268`) |
| Design rules, UX notes, the SolidCash developer log and feedback | `docs/` | 15 and 16 Nov |

Check it: `git diff --stat blaze-start HEAD`, or compare the [tag](https://github.com/astrorehan/pusaka-bch/tree/blaze-start)
with the current branch on GitHub.

## If something doesn't work

| Problem | What to do |
|---|---|
| "We can't find this plan" on `/try` | The example plans are not on this network. Tell us in the BLAZE Telegram, and use the [Chipnet transactions](#transactions-you-can-open) meanwhile |
| A "Test network: no real money" badge at the top | You are on the Chipnet build. Use the mainnet link at the top of this page |
| The wallet does not connect | Use Paytaca, or Cashonize 0.9.0 or later, and scan the QR code from the review sheet. Make sure the wallet is on mainnet |
| "Your wallet does not hold enough BCH for this, including the network fee." | Sending needs about 18,000 satoshis in your wallet. Add a little BCH and press **Try again** |
| "Cancelled in your wallet. Nothing was sent." | You declined in the wallet. Press **Send to heirs** again |
| The wallet asks you to sign twice | Expected: the first request gathers your coins at one address, the second is the payout |
| "The network did not accept this transaction. Nothing was sent." | Open **Details** for the reason and press **Try again**. If it repeats, send us the Details text |
| "Can't reach the network" | The app could not reach a BCH server. Press **Try again** |
| "This example was already sent" | Other judges used every example plan. Press **Make a plan for your family**, or open the payout transactions above |
| The explorer does not show the transaction yet | Wait a few seconds and reload; a new transaction can take a moment to appear |

## Good to know

- **Shares are a snapshot.** They are fixed when the plan is made. If the family changes, the owner takes the BCH
  back and makes a new plan.
- **Heirs need a BCH address**, an ordinary one (P2PKH). Each share must be at least 546 satoshis.
- **At most 10 heirs.** SolidCash 0.50 cannot combine a payout loop with a time check, so the contract has 10
  fixed payout slots. Details: [`docs/solidcash-feedback.md`](docs/solidcash-feedback.md).
- **The network clock runs about an hour behind.** The contract follows the network's clock (the median time of
  the last 11 blocks), which was 74 minutes behind on Chipnet on 15 Nov. Every date in the app says "about".
- **Every action costs the person who presses it about 9,000 to 12,000 satoshis** in network fees. Each stateful
  call is a 9 to 12 KB transaction. That includes Send to heirs, so whoever sends needs a little BCH.
- **Keep the plan link.** It is the only way to find the plan again. Until the owner saves, shares or copies it,
  the app asks "Leave without saving?" before they leave the success screen. The v2 wallet opens "Save your
  plan" right after a plan is funded or its rules change.
- **Known limitation: the plan details live off-chain.** Every action, including a claim and the payout, needs the
  full plan (heirs, contacts, waiting times), and Pusaka keeps no copy. A full plan is too large for the 223-byte
  OP_RETURN limit. If every copy of the link and the file is lost, the BCH stays safe in the contract, but the app
  cannot act on it. That is why the link is meant to be shared with the heirs and contacts: it holds only public
  addresses and rules, never a key. Recovery from the chain alone is future work.
- **Faraid is worked out in the browser.** The contract enforces the resulting numbers; it does not check the
  rules of faraid itself.
- **It is not a legal will.** It moves only the BCH in the plan.
- More: [README](README.md), the [contract](contract/README.md), the [design rules](docs/DESIGN.md) and the
  [SolidCash developer log](docs/solidcash-dx-log.md).
