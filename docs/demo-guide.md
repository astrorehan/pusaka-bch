# Pusaka wallet guide

Current public test app: https://astrorehan.github.io/pusaka-bch/wallet/demo

The public proof wallet is read-only for a different owner. Its balance and status
come from Chipnet. Create your own wallet to exercise owner actions.

## Owner

1. Open **Wallet**, choose **Set up wallet**, and connect Paytaca.
2. Add heirs and choose equal shares, integer custom shares or the existing faraid
   family calculator. Verify addresses and the calculation before approving.
3. Add three distinct trusted contacts. Choose inactivity and review periods.
4. Enter an initial usable BCH balance. This creates a new Pusaka receive address.
   Keep at least 600 sats at the first ordinary wallet receive address for authorization.
5. If necessary, use **Prepare wallet**, review that separate transaction, then
   review wallet creation. Approve each in Paytaca. Save the resulting plan JSON/link.
6. Use **Send** for partial BCH payments. Protected change remains in Pusaka and
   the same transaction renews activity. **I'm still here** is the fallback.
7. **Receive** shows the permanent BCH inbox. Incoming funds are protected without
   owner approval. **Collect** makes batched receipts spendable and charges the
   reviewed network fee. Incoming receipts never renew activity.
8. During review, **Stop claim** or an ordinary BCH payment cancels the claim.
   An owner token send and Swap currently ask you to stop a pending claim first.
9. **Take funds back** retires the current BCH balance. The old receive address
   still protects later receipts. Token holdings stay under the plan's family rules.

## Family

Open the shared plan link or import its JSON. A contact connects their own wallet
and chooses **Confirm a claim**. The first approval has no spending authority.
The second distinct contact opens the full review period. Alternatively, anyone
can open an inactivity claim after the network deadline.

Wait for the anchor to confirm and its chain age to mature. The network clock can
lag behind a phone. **Pay the heirs** submits the fixed BCH distribution.
Afterward, **Pay late receipts** handles new BCH. Under **Protected tokens**,
**Pay heirs** distributes one fungible receipt per transaction; the submitter
provides BCH for token carriers and fees. All indivisible units go to the final heir.

## Swap

On Chipnet, open **Swap** for BCH / PSK. PSK is a test token, not an investment.
Get a quote, inspect minimum return and fees, then review the complete transaction.
The token output goes directly into your Pusaka token vault. Use that token
address only for supported fungible tokens. The BCH inbox is a different address.

## After reconnecting

Open the saved plan link or choose **Open a plan** and paste JSON. Public rules
rebuild the same addresses, and the app discovers current state from the chain.
Reconnect the correct wallet for owner or contact actions. Save an updated link
after policy edits; old policy data fails closed instead of redirecting payouts.

An accepted transaction still needs block confirmation. If submission times out,
check its transaction ID and refresh before trying again. The local activity list
records submissions from that browser, not a complete recovered chain history.

## Demo narration

Show the usable BCH balance, a partial payment renewing activity and a new receipt.
Show two contacts opening review and the owner stopping a false claim. Then show
a valid mature claim and the fixed multi-heir payout. Finish with the Cauldron
swap and the token payout receipts in the verification record.

The 512-second Chipnet review is a test configuration. New UI plans default to
90 days of inactivity and at least 7 days of review. Explain the initial move to
a new address. Do not promise inheritance for untouched Paytaca or exchange funds.

The real phone/mainnet checks still pending are listed in
[the release evidence](proofs/app-and-assets.md).
