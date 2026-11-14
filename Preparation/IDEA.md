# Pusaka on Bitcoin Cash

> Status: scope agreed 12 Nov 2026. 14 Nov: contract moves to SolidCash; the SolidCash bounty replaces XO as the main bounty. Facts and sources are in `FINDINGS.md`.

## One sentence

Decide today who gets your BCH. If you stop checking in, the coins are split among your heirs by the shares you chose (equal, custom, or Islamic faraid), in one transaction, with no company or server in between.

Positioning (decided 14 Nov): universal first. Pusaka is for every holder with a family. Faraid is the proof of strength and an extra market, never the headline, so no one reads the product as "only for Muslims" or "only for Indonesia". The BCH version already drops everything Indonesia-specific from the Monad version (rupiah, bank payout).

Pitch order for the judges: open with "what happens to your BCH when you die?", not with "vault" (four or five BLAZE 2026 projects already use that word). Then: Last Will (2019) handles one heir on a desktop plugin; Pusaka handles a whole family, in the browser, with any split. Faraid comes last, as proof: it is the hardest split there is (many heirs, fixed fractions, blocking rules), so if Pusaka handles it, it handles any family. It also opens a market no BCH tool serves.

Story for the SolidCash bounty (same judges): Pusaka started as a Solidity app on Monad. SolidCash let us bring the same Solidity-style contract to BCH, where it runs without gas, accounts or a company in between.

## Premise

1. **Universal problem.** Coins are lost forever when the owner dies and the keys are not passed on. Every long-term BCH holder has this problem, including the judges.
2. **Existing tool falls short.** Last Will (Licho, 2019): one heir, Electron Cash desktop plugin, no recent updates.
3. **Muslims cannot use any existing tool.** Faraid fixes each heir's share (Qur'an An-Nisa 4:11, 4:12, 4:176). Dead-man switches on BCH and BTC send everything to one person or use arbitrary shares.
4. **Faraid is the hardest case.** Many heirs, fixed fractions, blocking rules. If the contract handles faraid, equal and custom splits are presets.
5. **Market.** Every BCH holder with a family; on top of that, about 2 billion Muslims that no BCH tool serves today. Business angle for the judges: an inheritance feature any BCH wallet can embed (one judge builds Selene Wallet; Paytaca is a sponsor).

## Scope

**Core (must ship):**

1. One **SolidCash** contract with three actions:
   - `checkIn`: owner resets the timer. Proven by spending one of the owner's own coins in the same transaction, so any WizardConnect wallet works.
   - `withdraw`: owner takes everything back, any time.
   - `distribute`: after the inactivity period, anyone can trigger it, no signature. The contract forces one output per heir with at least their share.

   Target form: Solidity style, so the bounty sees SolidCash's features at work: a `struct` per heir, events (`CheckedIn`, `Distributed`), a `modifier` for the owner check, the satoshi container for the balance, state for the deadline. Timer: count time in seconds, never in blocks, because BCH is expected to move to one-minute blocks (a block-counted period would then pass about 10 times faster). Candidate: an absolute deadline with a `tx.time` timestamp (check-in proves the current time through the locktime and moves the deadline forward); alternative: time-based `this.age`. Fallback: the stateless covenant in `prototype/`, which already compiles in SolidCash unchanged. Day 1 decides which one ships. Rule for that decision: judges punish bugs harder than they reward features, so the stateful form ships only if its whole flow works without rough edges on Chipnet and through WizardConnect.
2. Shares computed off-chain by the faraid calculator (reused from the old Pusaka, declared as pre-existing). The contract only enforces the resulting numbers.
3. Presets: equal (the default), custom percentages, Islamic faraid.
4. **Will link.** A link or file holding the vault's data (owner, heirs, shares, period). Without it nobody can rebuild the contract and claim, so the app must make the owner save and share it. Also what an heir opens to see the vault and press "distribute".
5. Web app: connect with WizardConnect (button at the top right, as the organiser asks), three steps (connect, heirs, fund), vault page with countdown, check-in, withdraw, distribute. English UI. It must show the whole contract lifecycle (the SolidCash bounty asks for that).
6. Tests in `solidhat` (mandatory for the SolidCash bounty). Port the 12 prototype cases first.
7. Judge path: a judge must reach a real mainnet transaction in about a minute. Plan: a demo vault whose deadline is already behind the network clock, so the payout can be triggered right away (to be confirmed on Chipnet). Fallback: pre-funded vaults that are already past their period, which any visitor can distribute.
8. Eligibility items: top-of-page banner (presentation link, repo link, CashTokens address, old Pusaka repo + demo), Widget Factory presentation, live hosted site, DoraHacks Build with the SolidCash bounty application.
9. Before/after must be unmistakable, because judges score only the 8 days. "Before" = the Monad app (repo + Vercel demo) plus this prep repo as it stood at 14 Nov 14:00 UTC (tag `blaze-start`). The banner and one slide list exactly what was built during BLAZE.

**Decided against:**

- Separate challenge window and witnesses. The owner can check in or withdraw at any time before distribution, which already serves as the objection. Judges reward simple things that work.
- Everything Monad-specific: MockIDR, bank payout / MitraCair, passkey, EIP-7702, relayer. No server at all.

**Alongside the build:**

- Each SolidCash bug we hit: a short issue or pull request to github.com/solidcash/solidcash (the bounty expects this; AI help is allowed here, but fix the issue rather than only reporting it).
- Keep a dated developer-experience log in `docs/solidcash-dx-log.md` (what was easy, what broke, workarounds, issue/PR links). mainnet_pat says substantial DX feedback alone can win the bounty, so it becomes a section of the submission.
- Pitch the port: show the old Solidity contract (Monad) next to the SolidCash version, for the "EVM developers come to BCH" angle he wants.
- Vault page shows the contract state in plain words (owner, heirs, shares, deadline, balance), since explorers show SolidCash state only as hex.
- Tell the sponsor (mainnet_pat, Telegram) the plan early and ask for feedback. The bounty rules say good collaboration counts in favour.

**After the core works:**

- Faraid on-chain: port `FaraidLib.sol` as a SolidCash `library`, so the contract itself checks that the shares follow faraid. Strong for innovation and for "syntax variety". Only if day 1 shows it fits the 10,000-byte limit.
- A "known limits" section (shares are a snapshot: the owner must redo the vault when the family changes; heirs need a BCH address).
- Check-in reminder (calendar file).
- Media Track entry: one short video ($1,000, may enter both tracks).
- Build with XO bounty (0.3 BCH): only if time is left. The ~500-word feedback must be written by the user personally.
- Balance held in PUSD, so the estate's value does not swing.

## Prize targets

| Target | Prize | Needs |
|---|---|---|
| Mainnet Track | $3,500 / $1,500 / $750 PUSD | Everything in Core |
| Best SolidCash Application | 2 / 1 / 0.5 BCH | SolidCash contract on mainnet, solidhat tests, usable UI, PRs upstream |
| Community Choice | $750 PUSD | CashTokens address in the banner + being visible in Telegram/X |
| Media Track | $1,000 PUSD | One engaging video, hosted link |
| Build with XO (optional) | 0.3 BCH | XO template + invitation + personal feedback |

## Build order

1. SolidCash day: create a solidhat project; port the prototype and its 12 tests; write the Solidity-style version; try compiling the old `PusakaVault.sol` and `FaraidLib.sol` with `evmCompat` and note sizes. Decide stateful or stateless by the end of the day.
2. Chipnet: deploy, test the real deadline and the "already expired" demo vault.
3. WizardConnect: connect Paytaca and Cashonize, sign a funding transaction, then a check-in, both built by the SolidCash SDK. Pat has not built WizardConnect tooling for SolidCash (14 Nov), so this step is ours: start from `generateWcTransactionObject()` (inherited from CashScript, untested on stateful transactions), and send whatever we build or fix upstream as a PR (counts toward the bounty as developer-experience work).
4. Web app, core flow on Chipnet, then mainnet with small amounts.
5. Will link, banner, presentation, hosting, DoraHacks Build.
6. Polish the first minute of the judge path. Then the extras above.

## Answered questions

- N outputs with fixed amounts in one transaction: yes, tested up to 50 heirs.
- Rounding: round down per heir; leftover satoshis go to the miner fee. The UI must refuse deposits so small that a share falls under the 546-satoshi dust limit.
- Reusing old work: allowed if declared in the banner with the old repo and a pre-hackathon demo.
- "Is crypto halal?": out of scope for the product; Pusaka only makes sure whatever the owner holds is divided by the shares they chose.
- Does SolidCash accept our contract? Yes: `prototype/vault.cash` compiles with `solidc` 0.50.0 after changing only the pragma (14 Nov).
- One project may enter several bounties; the Mainnet Track and bounties stack.
- Stateful or stateless? mainnet_pat (14 Nov): "keeping it stateful is a better option". Stateful is now the target; the stateless `prototype/` stays the fallback under the same day-1 rule (ship stateful only if the whole flow works cleanly on Chipnet and through WizardConnect).
- Does SolidCash have ready WizardConnect tooling? No (mainnet_pat, 14 Nov: not built yet, "your AI will figure it out"). We build it in step 3.
- Can the DoraHacks Build be edited? Yes, anything, until the deadline (organiser, BLAZE Telegram, 14 Nov). Nobody looks before the deadline, so early submission brings nothing.

## Still open

- Does a SolidCash transaction (stateful, with state NFTs) sign through WizardConnect in Paytaca and Cashonize? Nobody has tried yet (no SolidCash WizardConnect tooling exists); we find out in step 3, starting from `generateWcTransactionObject()`.
- Does an already-expired `tx.time` deadline let a judge distribute at once on the real network? The network clock (median time past) runs about an hour behind, so the demo deadline should sit a few hours in the past. (Chipnet, step 2)
- Does Selene support WizardConnect? (ask in Telegram)
