/**
 * Live Chipnet verification script for Stage 2 ClaimReviewProof & ClaimReviewAnchor.
 *
 * Usage (read-only balance & size check):
 *   node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/claim-review-chipnet-check.ts --network chipnet
 *
 * Usage (broadcast tiny Chipnet lifecycle + live non-BIP68-final rejection check):
 *   $env:CLAIM_REVIEW_CHIPNET_BROADCAST="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/claim-review-chipnet-check.ts --network chipnet
 */
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { SignatureTemplate, type Utxo } from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import {
  buildCancelClaimTx,
  buildDepositTx,
  buildFinalizeClaimTx,
  buildGenesisPlanTx,
  buildOpenClaimTx,
  buildOwnerWithdrawTx,
  discoverClaimReviewState,
  encodeReviewDurationToBip68Sequence,
  ensureGenesisUtxo,
} from './claim-review.ts';

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...args);

function signerTemplate(signer: any): SignatureTemplate {
  if (signer.signatureTemplate) return signer.signatureTemplate;
  if (signer.privateKey) return new SignatureTemplate(signer.privateKey);
  throw new Error('Signer does not expose privateKey or signatureTemplate');
}

async function waitForSpendableUtxo(
  provider: ElectrumNetworkProvider,
  address: string,
  minSats: bigint,
  excludeKeys = new Set<string>(),
): Promise<Utxo> {
  for (let i = 0; i < 15; i++) {
    const utxos = await provider.getUtxos(address);
    const match = utxos
      .filter(
        (u) =>
          !u.token &&
          u.satoshis >= minSats &&
          !excludeKeys.has(`${u.txid}:${u.vout}`),
      )
      .sort((a, b) => Number(b.satoshis - a.satoshis))[0];
    if (match) return match;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for >= ${minSats} sats plain UTXO at ${address}`);
}

async function sumPlainSats(provider: ElectrumNetworkProvider, address: string): Promise<bigint> {
  const utxos = await provider.getUtxos(address);
  return utxos.filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);
}

async function main() {
  if (network.name !== 'chipnet') {
    throw new Error(`Expected --network chipnet; got ${network.name}`);
  }

  const electrum = new ElectrumNetworkProvider('chipnet');
  const [owner, heir] = await ethers.getSigners(2);
  const ownerBal = await sumPlainSats(electrum, owner.address);
  const height = await electrum.getBlockHeight();
  log('network', network.name, 'height', height, 'ownerAddress', owner.address, 'balanceSats', ownerBal);

  if (process.env.CLAIM_REVIEW_CHIPNET_BROADCAST !== '1') {
    log('dry-check only (set CLAIM_REVIEW_CHIPNET_BROADCAST=1 to run live Chipnet tx check)');
    return;
  }

  if (ownerBal < 30_000n) {
    throw new Error(`Insufficient Chipnet balance (${ownerBal} sats) for live check; need >= 30,000 sats`);
  }

  const ownerTpl = signerTemplate(owner);
  const seq = encodeReviewDurationToBip68Sequence(512); // minimum 1 unit = 512s
  log('encoded BIP68 reviewSequence', `0x${seq.sequence.toString(16)}`, 'effectiveSeconds', seq.effectiveSeconds);

  const spentOutpoints = new Set<string>();
  const { genesisUtxo, preTxid } = await ensureGenesisUtxo({
    provider: electrum,
    ownerAddress: owner.address,
    ownerUnlocker: ownerTpl.unlockP2PKH(),
    minimumSats: 20_000n,
    fee: 600n,
  });
  if (preTxid) log('pre-split vout=0 genesis txid', preTxid);
  spentOutpoints.add(`${genesisUtxo.txid}:${genesisUtxo.vout}`);

  // 1. Genesis
  const genesis = buildGenesisPlanTx({
    provider: electrum,
    genesisUtxo,
    ownerUnlocker: ownerTpl.unlockP2PKH(),
    ownerAddress: owner.address,
    ownerPkh: owner.pkh,
    heirPkh: heir.pkh,
    reviewSequence: seq.sequence,
    initialDepositSats: 12_000n,
    fee: 600n,
  });
  const genesisHex = genesis.builder.build();
  const genesisTxid = await electrum.sendRawTransaction(genesisHex);
  log('1. genesis txid', genesisTxid, 'bytes', genesisHex.length / 2, 'planCategory', genesis.contracts.planCategoryHex);

  const waitState = async (expectedStatus: number | 'EXITED_OR_UNINITIALIZED', expectedTxid?: string) => {
    for (let i = 0; i < 20; i++) {
      const s = await discoverClaimReviewState(genesis.contracts);
      if (s.status === expectedStatus && (!expectedTxid || s.planUtxo?.txid === expectedTxid || expectedStatus === 'EXITED_OR_UNINITIALIZED')) {
        return s;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Timed out waiting for plan state ${expectedStatus}`);
  };

  // 2. Open Claim (creates dedicated ClaimReviewAnchor)
  let state = await waitState(0, genesisTxid);
  const sponsorOpenCoin = await waitForSpendableUtxo(electrum, owner.address, 5_000n, spentOutpoints);
  spentOutpoints.add(`${sponsorOpenCoin.txid}:${sponsorOpenCoin.vout}`);
  const { builder: openBuilder } = buildOpenClaimTx({
    contracts: genesis.contracts,
    planUtxo: state.planUtxo!,
    sponsorUtxo: sponsorOpenCoin,
    sponsorUnlocker: ownerTpl.unlockP2PKH(),
    sponsorChangeAddress: owner.address,
    fee: 1_500n,
  });
  const openHex = openBuilder.build();
  const openTxid = await electrum.sendRawTransaction(openHex);
  log('2. openClaim txid', openTxid, 'bytes', openHex.length / 2);

  // 3. Deposit during REVIEW (must leave Anchor untouched)
  state = await waitState(1, openTxid);
  const depositCoin = await waitForSpendableUtxo(electrum, owner.address, 5_000n, spentOutpoints);
  spentOutpoints.add(`${depositCoin.txid}:${depositCoin.vout}`);
  const depositHex = buildDepositTx({
    contracts: genesis.contracts,
    planUtxo: state.planUtxo!,
    fundingUtxo: depositCoin,
    fundingUnlocker: ownerTpl.unlockP2PKH(),
    depositSats: 2_000n,
    changeAddress: owner.address,
    fee: 1_500n,
  }).build();
  const depositTxid = await electrum.sendRawTransaction(depositHex);
  log('3. deposit-during-REVIEW txid', depositTxid, 'bytes', depositHex.length / 2);

  // 4. Verify live Chipnet node REJECTS immediate finalizeClaim (unconfirmed / < 512s BIP68)
  state = await waitState(1, depositTxid);
  const earlyFinalizeHex = buildFinalizeClaimTx({
    contracts: genesis.contracts,
    planUtxo: state.planUtxo!,
    anchorUtxo: state.anchorUtxo!,
    heirAddress: heir.address,
    fee: 1_600n,
  }).build();
  try {
    await electrum.sendRawTransaction(earlyFinalizeHex);
    throw new Error('UNEXPECTED: live Chipnet node accepted early finalizeClaim!');
  } catch (err: any) {
    const earlyRejection = String(err?.message ?? err);
    log('4. live Chipnet early finalizeClaim REJECTED as expected:', earlyRejection);
  }

  // 5. Owner immediately cancels claim (consumes & burns anchor, restores ACTIVE)
  const cancelCoin = await waitForSpendableUtxo(electrum, owner.address, 5_000n, spentOutpoints);
  spentOutpoints.add(`${cancelCoin.txid}:${cancelCoin.vout}`);
  const cancelHex = buildCancelClaimTx({
    contracts: genesis.contracts,
    planUtxo: state.planUtxo!,
    anchorUtxo: state.anchorUtxo!,
    ownerUtxo: cancelCoin,
    ownerUnlocker: ownerTpl.unlockP2PKH(),
    ownerChangeAddress: owner.address,
    fee: 1_800n,
  }).build();
  const cancelTxid = await electrum.sendRawTransaction(cancelHex);
  log('5. cancelClaim txid', cancelTxid, 'bytes', cancelHex.length / 2);

  // 6. Owner withdraws test balance cleanly back to owner
  state = await waitState(0, cancelTxid);
  const withdrawCoin = await waitForSpendableUtxo(electrum, owner.address, 5_000n, spentOutpoints);
  spentOutpoints.add(`${withdrawCoin.txid}:${withdrawCoin.vout}`);
  const withdrawHex = buildOwnerWithdrawTx({
    contracts: genesis.contracts,
    planUtxo: state.planUtxo!,
    ownerUtxo: withdrawCoin,
    ownerUnlocker: ownerTpl.unlockP2PKH(),
    ownerAddress: owner.address,
    fee: 1_500n,
  }).build();
  const withdrawTxid = await electrum.sendRawTransaction(withdrawHex);
  log('6. ownerWithdraw txid', withdrawTxid, 'bytes', withdrawHex.length / 2);

  await waitState('EXITED_OR_UNINITIALIZED');
  const finalBal = await sumPlainSats(electrum, owner.address);
  log('completed Chipnet check; ending owner balanceSats', finalBal, 'net fee spent', ownerBal - finalBal);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
