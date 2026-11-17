# Pusaka v2 mature Chipnet payout

17 November 2026. This record covers the stage 3 construction before the review
corrections to CLOSED receipt recovery, owner fee funding, metadata and deadline
bounds. It does not establish live verification of a later artifact.

The test used known Chipnet fixture keys. No mainnet funds or Paytaca session were
used. The plan's public checkpoint was created by the live runner with
`PUSAKA_V2_LEAVE_REVIEW=1`, then resumed with `PUSAKA_V2_CHIPNET_RESUME=1`.

## Consensus maturity evidence

- Category: `5fd7aeec3387cd85811dee59a4a3918f79f68b44076dfc8c152d7e105b41fd0b`.
- Opening anchor transaction:
  `a3c8a67c741f2ab26611e81a113aea32aaf653f476db73319645a7103fa1b6a6`.
- Anchor confirmed at height 335413. At tip 335430, its preceding-block median
  time was 1794924116 and the spending median time was 1794925194. The measured
  relative age was 1,078 seconds, exceeding the configured 512-second delay.
- The earlier immediate attempt in this lifecycle was rejected with
  `non-BIP68-final (code 64)`.

The first resume attempt failed to connect to the WebSocket server. The retry
succeeded. The runner reported the following accepted Chipnet transactions:

| Action | Transaction | Bytes |
|---|---|---:|
| Mature payout | `4c2004aa2b5533707b9158f11abb673be34fb9c742c7c4efeb97539e9a45f717` | 3,871 |
| New payment to the inbox after payout | `c30ef0d32f3ba5e4e642060e38f65910256de4b53287ba711bad8291ab4013be` | — |
| Permissionless late-receipt sweep | `b69743255e7079c8620acc1225278c953235ca3368cfb9d1c475087636de7acd` | 3,586 |
| Late-receipt payout to the heirs | `5c833d6ac78de62adce56a4c267e1a578934cd919a093a422cc26c92becc094b` | 3,640 |

The runner exited successfully and removed its completed public checkpoint.
These results close the live maturity and post-payout receipt gates for this
earlier construction. Revised contracts need their own transaction evidence.
