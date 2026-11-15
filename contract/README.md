# Pusaka contract

The Pusaka inheritance vault in [SolidCash](https://github.com/solidcash/solidcash), tested with SolidHat. Written during BCH BLAZE 2026.

- `contracts/Pusaka.scash`: the main contract, stateful and Solidity-style. The owner checks in to move a deadline forward (counted in seconds) or withdraws at any time. After the deadline anyone can pay the heirs (1 to 10), each by their fixed share, in one transaction.
- `contracts/VaultStateless.scash`: the stateless fallback, ported from the pre-hackathon CashScript prototype in `../prototype/`.
- `test/`: solidhat tests for both, run against the real BCH 2026 consensus limits (see `solidcash.config.ts`).

```sh
npm install
npm test
```

`npm test` compiles and then runs Vitest directly, because `solidhat test` exits without running the tests on Windows (see `../docs/solidcash-dx-log.md`).
