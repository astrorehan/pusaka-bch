# Findings (checked 11 Nov 2026, late evening WIB)

Rules below were read from the DoraHacks page data itself (Details, Tracks and Resources tabs), not from search summaries. DoraHacks rejects plain automated fetches but answers a normal browser request. Items still open are marked **[check]**.

## Hard requirements (Mainnet Track) — missing any one means not eligible

1. Registered on DoraHacks. Registration closes **Fri 13 Nov 13:00 UTC = 20:00 WIB**.
2. **Roll call.** One team member must attend at least one preparation stream. Four of the five are over; the only one left is the **Kick-off Stream, Sat 14 Nov 14:00 UTC = 21:00 WIB**. Roll call is done during the stream at https://bchblaze.cash/live/ by connecting a wallet with WizardConnect and typing the DoraHacks username.
3. **Confirm the project is real** in the BLAZE Telegram channel (https://t.me/bchblaze).
4. At least one feature sends BCH **mainnet** transactions. No transaction link needed, but "it must be possible USING the app for anyone (ie the judges) to simply & clearly make a useful BCH mainnet transaction".
5. A **live, usable demo** behind a website link that judges can click and try.
6. **WizardConnect integration or XO Template integration** (or both). The Tracks tab still says WizardConnect only; the Details tab has the newer "or XO" wording.
7. **Top-of-page banner on the home page** with:
   - link to a short presentation based on the "Widget Factory" Google Slides template,
   - link to the GitHub/GitLab repo,
   - a CashTokens address that can receive EMBER2026 tokens (community choice voting). **Prize money is also paid to this address** (organiser in Telegram, 14 Nov), so it must be a wallet the user controls (Paytaca shows a token-aware `bitcoincash:z...` address),
   - for pre-existing projects: links to the old repo, the new repo, and a demo of the project as it was before the hackathon.
8. Original, or significantly improved during the hackathon. Pre-existing work is allowed if declared in the banner.

Not mandatory on DoraHacks: git repo link field and video link field (`mandatoryGitRepoLink: false`, `mandatoryVideoLink: false`). No country, KYC or age limits are stated.

Roll call and Telegram check-in can be waived only for known BCH builders, at the organiser's discretion (Jeremy). Not us.

## Information Session, 17 Oct (transcript read 14 Nov)

Recording: https://www.youtube.com/watch?v=9qudgWloY1g. Timestamps in brackets.

- **"Before" means the code at the start of hacking, 14 Nov 14:00 UTC (21:00 WIB).** Anything coded before then is "before". Judges score only what changed during the 8 days and judge harshly if the difference is unclear [34:41-36:33]. Pre-existing projects show two repos and two demos (before and after) in the banner and explain the difference in the slides [72:14]. A preparation folder with plans in the repo is fine [33:50]. If the old app cannot be hosted, a "prior art disclaimer" with a link is acceptable [76:46].
- Roll call: the session (17 Oct) listed only the info session and three workshops, but the newer DoraHacks rules (checked 14 Nov) say "1 of the 5 streams", including the Kick-off Stream on 14 Nov. The kickoff counts.
- WizardConnect: a working connect is enough; put the "Connect wallet" button at the top right [40:16].
- Judges reward "instant, slick, and it just works". One simple flow that works 100% beats many features with edge cases; one bug costs a lot of credibility [73:29-74:34]. Technical strength also asks for "a new innovative use for money not possible any other way" [59:10-59:59]. Business: "I would put money into this" [60:52].
- Judges expect 50-100 projects over about four days: 5-10 minutes per project at best, maybe one minute [79:40]. They read the Widget Factory deck before opening the demo [81:13].
- Video is not required [87:02].
- The submit button closes automatically at 22 Nov 14:00 UTC. Use the last 24 hours only to check the submission. The final check-in stream (Sat 21 Nov 14:00 UTC) covers requirements and "what the judges have been thinking" [19:03, 31:39].
- Prizes are paid in PUSD to the banner address, with no KYC [88:04]. Bounties are escrowed with the organiser and paid by the sponsor after the showcase [64:05].
- Solo is fine: last year's top 2-3 were all solo [21:57]. AI use is encouraged [40:08]. Code must be open source [43:39].
- Prizes stack; last year one project won Community Choice and 2nd place. You may vote for yourself [52:26, 66:35].
- Not covered in the session: whether a DoraHacks Build can be edited after submission or approval. **Answered in the BLAZE Telegram, 14 Nov:** Jeremy (organiser) confirmed you can change anything until the deadline, and there is no need to submit until just before it because he will not look until then. Another hacker's reading, which he confirmed: create the Build, edit it freely, submit once ready; on day 1 only the banner links (repo + pre-hackathon demo) are needed.

## Widget Factory presentation template

Six slides: title (name, site, X handle, team, one-line pitch, repo link), the story, benefits (short bullets), BCH usage, the vision, thank you. Template: https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit

## Judging (Mainnet Track)

Three judges, four categories, each scored out of 10. 120 points total. Ties are broken by a 2-of-3 vote.

| Category | Judge's question |
|---|---|
| Innovation & creativity ("Is it cool?") | Is it new and creative? Does it make you excited to use BCH? |
| Design & usability ("Is it slick?") | How easy is it to use? Is the UI intuitive? Does it look good? |
| Technical strength ("Does it work?") | Good use of BCH's monetary properties and/or scripting? Bugs? Scalable to many users? Security or specification flaws? |
| Business or investment potential ("Will it make money?") | How likely to become a profitable business? Would you fund it? |

Judges:
- **Elliot Price**, Vice President at BCH Bull, founder of BCH Alliance.
- **Kallisti**, lead developer of Selene Wallet.
- **Sayoshi Nakamario**, creator of FundMe.cash, Helpme.cash, Bitcoin Cash University, Badgers.cash.

Judge timing note (paraphrased from the page): expect no more than a couple of minutes per project. Extra attention is earned by the first impression and the Widget Factory presentation. Mockups and unusable scaffolds get skipped. "Simpler things that work are better than complex things that are confusing or have rough edges."

## Prizes

| Prize | Amount |
|---|---|
| Mainnet Track 1st | $3,500 PUSD + BLISS 2027 tickets for the whole team |
| Mainnet Track 2nd | $1,500 PUSD + 1 BLISS 2027 ticket |
| Mainnet Track 3rd | $750 PUSD + 1 BLISS 2027 ticket |
| Media Track (one winner) | $1,000 PUSD, judged by Jeremy alone: engaging, could go viral, teaches people about BCH |
| Community Choice | $750 PUSD, most EMBER2026 tokens sent to the project's address (tokens are airdropped to BLISS Belle NFT holders) |
| TokenHunt Completion Pool | $250 PUSD airdropped to completed projects |

A builder may enter both the Mainnet and the Media track. Media needs the same roll call, Telegram check-in and a hosted link.

## Sponsor bounties (stackable)

| Bounty | Prize | Sponsor | Notes |
|---|---|---|---|
| Build with XO | 0.3 BCH × 10 | General Protocols | New XO template, a transaction on Chipnet or Mainnet via an invitation that can be inspected at blaze.xo.cash, reproduction steps, ~500 words of feedback |
| Migrate to XO | 1 BCH × 5 | General Protocols | Move an existing application's functionality to XO; link the original working project and the XO version |
| Stablecoin Bridge | $750 PUSD | BCH BLAZE | Bridge/swap stablecoins between BCH and another chain |
| Decentralized Identity | $500 PUSD | Paytaca | Proof of concept linking BCH and Nostr identities |
| Best SolidCash Application (added after 11 Nov) | 2 / 1 / 0.5 BCH | mainnet_pat | Solidity-syntax contract compiled to BCH with SolidCash, running on mainnet. See below |

- XO feedback must be personally written: "AI written submissions will be rejected".
- XO bounties: use the latest `0.1.0-next.xxx` engine. The best qualifying submissions win, not the earliest.
- Submitting to a bounty waives IP rights over the project for consideration.
- Whether "existing application" in Migrate to XO may be a non-BCH app (the Monad Pusaka) is not stated. **[check: ask in the General Protocols Telegram]**

### Best SolidCash Application (checked 14 Nov, https://bchblaze.cash/bounties/)

- SolidCash: a framework that compiles Solidity-style contracts natively to BCH. Repo https://github.com/solidcash/solidcash (created 23 Oct 2026, 2 stars), site https://solidcash.org. It is a fork of CashScript with extra Solidity features (state, mappings, contract composition). The README calls large apps a "mocknet beta"; small apps are proven on a real node.
- Prize: 2 BCH 1st, 1 BCH 2nd, 0.5 BCH 3rd (the site says 3.5 BCH total; the DoraHacks card shows 3 BCH). Judged by the regular hackathon judge committee.
- Wanted: contract deployable and runnable on mainnet, using most SolidCash features and syntax variety. Focus is the contract, but the UI must demonstrate the contract lifecycle.
- "Porting existing EVM projects is allowed and encouraged." The Monad Pusaka is an EVM project.
- Testing with the `solidhat` environment is mandatory.
- Builders are expected to use AI and send fixes for SolidCash problems they hit as pull requests to the main repo.
- Tested 14 Nov: `prototype/vault.cash` compiles with `@solidcash/solidc` 0.50.0 after changing only the pragma to `pragma solidcash ^0.50.0;` (235 bytes without constructor args). Plain `pragma solidity` files are refused unless `evmCompat` is enabled.
- The SDK (`@solidcash/solidcash` 0.50.1) keeps `generateWcTransactionObject()`, so the WizardConnect plan carries over.
- SolidCash docs: `this.age` can count blocks or 512-second units; `tx.time` takes a block height or a Unix timestamp. `block.timestamp` / `block.number` come from a shared oracle the owner updates (can lag), so avoid them. `msg.sender` is not authenticated under the default composition; use a signature or an owner-coin check.

### Bitcoin Cash Podcast #195, mainnet_pat on SolidCash (aired 8 Nov; transcript read 14 Nov)

Recording: https://www.youtube.com/watch?v=C6rn01LOwQs. Auto-captions, timestamps in brackets.

- **The bounty can be won "with a working application, but also just with substantial feedback on the developer experience"** [100:10]. He wants EVM developers to try BCH, determined first users who find what he missed, PRs (issues also welcome), and AI users who fix issues themselves instead of filing them only [98:45-100:54]. Soundness matters to him: a contract that is not sound or secure would make BCH "laughable" [56:43].
- Maturity: released about two weeks before the episode, "not the final product by no means" [56:24, 61:15]. 96% of Solidity's own test suite passes [14:58]. A SushiSwap clone ported with almost no contract changes, but with all block information removed [61:27-61:53]. VM limits are tight; guards and stack work eat the budget; smaller bytecode (lower fees) is still to do; undiscovered bugs are possible [25:33, 88:04-91:02]. No coverage tool yet; explorers show state as raw hex [89:06-90:05].
- His porting method: run the EVM project's own tests against the BCH deployment [60:33].
- **Network: a one-minute-block upgrade is expected to lock in around 15 Nov** [06:36, 121:14] (captions call it "Mina"; activation months later). A timer counted in blocks would then run about 10 times faster. Count time in seconds (`tx.time` timestamp or time-based `this.age`), never in blocks.
- Not covered in the episode: WizardConnect or wallet signing of SolidCash transactions, stateful readiness on mainnet, solidhat, inheritance-type contracts.

### mainnet_pat, Telegram DM reply (14 Nov)

Answer to the two questions in `README.md` → "Draft message to mainnet_pat":

- Stateful vs stateless: "keeping it stateful is a better option."
- WizardConnect: he has not built WizardConnect tooling for SolidCash; he expects an AI-assisted developer to work it out. So `generateWcTransactionObject()` in the SDK is leftover from CashScript and unproven for stateful transactions. Building that path ourselves and sending it upstream fits what he asks bounty entrants for (PRs, fixing issues instead of only filing them).

## Field (as of 11 Nov)

- 304 hackers registered on DoraHacks, 0 projects submitted yet.
- 18 public GitHub repos mention BLAZE 2026. Grouped:
  - payment links / invoices: bch-pay-links, kvit, bch-paylink, bch-split
  - AI agent spending limits: agentleash-bch, streamvault.cash, payagent
  - vaults and escrow: holdfast (daily allowance + guardian), cashvault-xo, cashpulse-vault, showup-bch, cashtokens-bch-stream-vault, latch-bch (not submitted)
  - other: release-seal, marketinsight, ember-drop-xo, two Media-track shorts
- **None is about inheritance, wills or heirs.** But "vault" is a crowded word here, so the pitch should lead with inheritance, not with "vault".
- Prior art on BCH is still only Last Will (Licho, 2019): one heir, Electron Cash desktop plugin. Its contract is the example in the CashScript covenant guide, so the judges know the idea and its limits.
- BLAZE 2025 winners: see table at the bottom. 2025 non-winning projects not reviewed (the list loads client-side) **[check, low priority]**.

## Technical — tested

A prototype contract and test are in `prototype/` (CashScript 0.14.0, run against the BCH VM in `MockNetworkProvider`). 12 of 12 cases behave as intended.

| Question | Result |
|---|---|
| Can a covenant force one transaction to pay N heirs their fixed shares? | Yes. 6 heirs: 623-byte transaction. 20 heirs: 1,437 bytes. 50 heirs: 3,177 bytes. |
| Does it reject cheating? | Yes: early payout, underpaying one heir by 1 satoshi, swapping an address, adding an extra output are all rejected. |
| Who can trigger the payout? | Anyone, without a signature. Heirs do not need to connect a wallet. |
| Rounding | Each heir gets at least `(balance − fee budget) × share ÷ total`, rounded down. Leftover satoshis go to the miner fee (3 satoshis in the 6-heir test). |
| Contract size | 362 bytes for 6 heirs, 1,420 bytes for 50. Limit for P2SH is 10,000 bytes. |
| Owner check-in without the wallet signing a contract input | Works: the contract requires that input 1 is a coin from the owner's own address. The wallet only signs its normal coin, which every WizardConnect wallet can do. |

Faraid test case used: wife 15, father 20, mother 20, two sons 26 each, daughter 13, out of 120.

Test coins (checked 14 Nov):

- Chipnet tBCH: faucet https://tbch.googol.cash/ (choose chipnet; recent payouts 0.01017 tBCH each; simple CAPTCHA the user fills in).
- Test PUSD: Jeremy points to the Paryon Telegram (https://t.me/paryonusd). Paryon's docs mention no chipnet PUSD and no faucet, so ask there. PUSD is a CashTokens fungible token; Cashonize has full support, Paytaca and Selene handle it too.

Still to test on Chipnet (needs the real network, not the simulator) **[check, day 1]**:
- The real waiting period (`this.age`). The simulator checks the script, not the block count.
- Whether a period of 0 blocks lets a judge create a vault and trigger the payout right away. Blocks come every ~10 minutes, so a judge cannot wait for a real period.
- The full flow through a real wallet over WizardConnect (Paytaca and Cashonize).

Other technical facts:
- CashScript 0.14.0 (6 Oct 2026) has loops, reusable functions and bitwise operators. `cashscript` SDK builds the WizardConnect request with `generateWcTransactionObject()` plus `inputPaths`.
- WizardConnect packages: `@wizardconnect/dapp` 0.2.2, `@wizardconnect/core` 0.2.5, `@wizardconnect/react` 0.2.3. The wallet connects by scanning a QR code; the relay runs over Nostr.
- Wallets confirmed to support WizardConnect: **Paytaca** and **Cashonize** (0.9.0 and later). Selene: not confirmed **[check]**.
- Filling signatures inside a contract input over WizardConnect is wallet-dependent (Paytaca does it). The owner-coin design above avoids relying on it.
- `this.age` in the SDK is counted in blocks only. Maximum relative timelock is 65,535 blocks, about 455 days.
- OP_RETURN data is limited to 220 bytes per transaction; dust limit is 546 satoshis for a normal output.
- XO engine is early (`@xo-cash/engine` 0.0.1 on `latest`, `0.1.0-next.xxx` on `next`); docs warn of breaking changes.

## BLAZE 2025 winners (from the archive)

| Track | Place | Project | Prize |
|---|---|---|---|
| Chipnet | 1 | Mean-Reversion Portfolio Rebalance (covenant rebalancing) | 5 BCH |
| Chipnet | 2 + Community | Lamport Sigs (quantum-resistant signatures) | 3 BCH + 1.038 BCH |
| Chipnet | 3 | Crypto Focus Garden (proof-of-focus NFTs) | 1 BCH |
| Mainnet | 1 | bch-ipfs-scrape (pins on-chain IPFS data) | 2.5 BCH |
| Mainnet | 2 | FortressVault (covenant: withdrawal limits + emergency rescue) | 0.5 BCH |
| Mainnet | 3 | Badger Survivors (simple example game) | 0.5 BCH |
| Mainnet | 4 | Jump to Layer 1 (Solidity → CashScript converter) | 0.5 BCH |
| Mainnet | 5 | EternalCash (executor for perpetuity contracts) | 0.5 BCH |

The 2026 mainnet prizes are far larger than 2025's (first place $3,500 vs 2.5 BCH), and 304 people are registered, so expect a stronger field than the 2025 list suggests.

## Sources

- https://dorahacks.io/hackathon/bchblaze2026/detail and /tracks (page data, read 11 Nov)
- https://bchblaze.cash/ (+ /bounties/, /live/, /tokenhunt/, /archive/, /forge/)
- https://github.com/CashScript/cashscript (docs: release notes, script limits, WalletConnect & WizardConnect guide)
- https://wizardconnect-456f57.gitlab.io/ (dapp and protocol pages)
- https://stack.xo.cash/getting-started.html
- https://paryonusd.com/docs/getting-started/wallet-compatibility
- https://thebchbullet.substack.com/p/the-bch-bullet-sunday-8th-november
- GitHub repository search "bch blaze 2026" (11 Nov)
- https://github.com/KarolTrzeszczkowski/Electron-Cash-Last-Will-Plugin
