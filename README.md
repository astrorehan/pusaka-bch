# Pusaka

**Decide today who gets your BCH.** If you stop checking in, a contract splits your coins among your heirs by the shares you chose (equal, custom percentages, or Islamic inheritance law), in one transaction, with no company or server in between.

*Pusaka* is Indonesian for "heirloom".

> Status: being built during [BCH BLAZE 2026](https://dorahacks.io/hackathon/bchblaze2026) (14–22 Nov 2026).

## Before and after BLAZE

Judges score the work done during the hackathon, so here is exactly what existed before it started.

- **Pusaka on Monad (earlier hackathon, Solidity):** [repo](https://github.com/astrorehan/pusaka) · [demo](https://pusaka-faraid.vercel.app). Reused here: the product idea and the faraid share calculator.
- **This repo at the start of BLAZE:** tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start), made before 14 Nov 2026 14:00 UTC. It holds only `prototype/`, a test contract.
- **Everything after `blaze-start`** is BLAZE work.

## prototype/

A pre-hackathon CashScript covenant that proves the core idea: one transaction can pay N heirs their fixed shares, and the contract rejects any transaction that pays less. It has three actions: `checkIn` (owner resets the timer), `withdraw` (owner takes everything back), `distribute` (after the inactivity period, anyone can trigger the payout).

```bash
cd prototype
npm install
npm test
```

The test runs 12 cases against the BCH virtual machine in a simulator (no network), including early payout, underpaying an heir by one satoshi, swapping an heir's address, adding an extra output, and check-in by a stranger.

## License

[MIT](LICENSE)
