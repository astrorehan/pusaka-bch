# Pusaka: BCH inheritance for the whole family

**Decide today who gets your BCH.** If you stop checking in, a contract splits your coins among your heirs by the shares you chose, in one transaction, with no company or server in between.

*Pusaka* is Indonesian for "heirloom".

> Status: being built during BCH BLAZE 2026 (14–22 Nov). This page is updated as features ship.

## The problem

When a holder dies without passing on their keys, their coins are lost forever. Every long-term BCH holder faces this.

The only inheritance tool on BCH, Last Will (2019), sends everything to a single heir and runs only as an Electron Cash desktop plugin. A family with a spouse, children and parents cannot use it.

## How it works

1. Connect your wallet with WizardConnect (Paytaca, Cashonize).
2. Add your heirs and choose a split: equal, custom percentages, or Islamic inheritance law (faraid). Set the check-in period.
3. Fund the vault and save the will link for your family.

After that:

- **Check in:** one tap resets the timer.
- **Withdraw:** take everything back at any time.
- **Distribute:** once the period has passed, anyone (an heir, a friend) can trigger the payout. The contract only accepts a transaction that pays every heir at least their share, all in one transaction. No signature, no company, no server.

## Even the hardest split

Islamic inheritance law (faraid) fixes each heir's share by law: many heirs, exact fractions, and rules where one heir blocks another. It is the hardest split there is, so a contract that handles faraid handles any family. It also serves about 2 billion Muslims that no BCH tool serves today.

## Why Bitcoin Cash

- The split is enforced by the contract itself, not by a promise.
- Paying many heirs at once costs a fraction of a cent. In our prototype one transaction paid 6 heirs in 623 bytes and 50 heirs in 3,177 bytes.
- Check-in spends one of the owner's ordinary coins, so any WizardConnect wallet can do it.

## Tech stack

- Contract: SolidCash (Solidity-style smart contracts compiled natively to BCH), tests in solidhat
- Wallet connection: WizardConnect
- Web app in the browser, no backend server
- Network: BCH mainnet (Chipnet for testing)

## Pre-existing work

Pusaka started at Monad Blitz Vol. 2 as a Solidity app on Monad. Reused here: the product idea and the faraid share calculator. New for BLAZE: the BCH contract, the wallet flow and the web app.

- Old repo: https://github.com/astrorehan/pusaka
- Old demo (before BLAZE): https://pusaka-faraid.vercel.app
- This repo at the start of hacking (a test contract only): https://github.com/astrorehan/pusaka-bch/tree/blaze-start
- New repo: https://github.com/astrorehan/pusaka-bch

## BLAZE 2026

- Track: Mainnet
- Bounty: Best SolidCash Application
- Live demo, repo, presentation and CashTokens address: added here as they go live.
