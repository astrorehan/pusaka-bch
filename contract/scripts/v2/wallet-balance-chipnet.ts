/**
 * Stage 1 Chipnet verification harness for WalletBalanceProof + WalletBalanceInbox.
 * Usage (read-only balance check):
 *   node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/wallet-balance-chipnet.ts --network chipnet
 * Usage (execute full Chipnet lifecycle with strict external-signer stand-in):
 *   $env:RUN_CHIPNET_TX="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/wallet-balance-chipnet.ts --network chipnet
 *
 * Security: uses only SOLIDCASH_MNEMONIC_CHIPNET via solidhat --network chipnet; never logs private keys or mnemonics.
 */
import { ethers } from '@solidcash/solidhat/hardhat3';
import {
  Signer,
  SignatureTemplate,
  TransactionBuilder,
  type ExternalTransactionSigner,
} from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { binToHex, encodeTransaction, hexToBin } from '@bitauth/libauth';
import {
  attachWalletBalancePlan,
  deployWalletBalancePlan,
  inspectWalletBalancePlan,
  sendProtected,
  sweepInbox,
  type WalletBalancePlanMetadata,
} from './wallet-balance-helper.ts';

const DAY = 86400n;
const PERIOD = 30n * DAY;
const FEE_BUDGET = 2000n;
const FARAID = [15n, 20n, 20n, 26n, 26n, 13n];

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);

function makeStrictExternalWallet(
  name: string,
  privateKey: Uint8Array,
): ExternalTransactionSigner {
  const unlocker = new SignatureTemplate(privateKey).unlockP2PKH();
  const ownLockHex = binToHex(unlocker.generateLockingBytecode());
  return {
    async signTransaction(request) {
      const { transaction, sourceOutputs, userPrompt } = request;
      if (sourceOutputs.length !== transaction.inputs.length) {
        throw new Error('sourceOutputs length mismatch');
      }
      let signed = 0;
      const inputs = transaction.inputs.map((input, inputIndex) => {
        if (input.unlockingBytecode.length !== 0) {
          throw new Error(`Expected empty unlockingBytecode at input ${inputIndex}`);
        }
        const mine = binToHex(sourceOutputs[inputIndex].lockingBytecode) === ownLockHex;
        if (!mine) return input;
        signed++;
        return {
          ...input,
          unlockingBytecode: unlocker.generateUnlockingBytecode({
            transaction,
            sourceOutputs,
            inputIndex,
          }),
        };
      });
      if (signed === 0) {
        throw new Error(`[${name}] refused to sign tx with 0 own inputs`);
      }
      const hex = binToHex(encodeTransaction({ ...transaction, inputs }));
      log(`  [${name}] signed ${signed}/${inputs.length} inputs (${hex.length / 2} bytes) prompt=${userPrompt ?? '-'}`);
      return { signedTransaction: hex };
    },
  };
}

async function medianTimePast(provider: ElectrumNetworkProvider): Promise<bigint> {
  const height = Number(await provider.getBlockHeight());
  const times: number[] = [];
  for (let h = height; h > height - 11; h--) {
    const headerHex = String(await provider.performRequest('blockchain.block.header', h));
    times.push(Number(new DataView(hexToBin(headerHex).buffer).getUint32(68, true)));
  }
  times.sort((a, b) => a - b);
  return BigInt(times[5]);
}

async function sumBalance(provider: ElectrumNetworkProvider, address: string): Promise<bigint> {
  const utxos = await provider.getUtxos(address);
  return utxos.filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);
}

const provider = process.env.ELECTRUM_HOST
  ? new ElectrumNetworkProvider('chipnet', { hostname: process.env.ELECTRUM_HOST })
  : new ElectrumNetworkProvider('chipnet');

const signers = (await ethers.getSigners(8)) as any[];
const [ownerKey, payerKey, ...heirKeys] = signers;

const ownerBal = await sumBalance(provider, ownerKey.address);
const payerBal = await sumBalance(provider, payerKey.address);
const mtp = await medianTimePast(provider);

log('Chipnet owner address:', ownerKey.address, 'plain sats:', ownerBal.toString());
log('Chipnet payer address:', payerKey.address, 'plain sats:', payerBal.toString());
log('Chipnet MTP:', mtp.toString());

if (process.env.RUN_CHIPNET_TX !== '1') {
  log('Read-only balance check complete. Set RUN_CHIPNET_TX=1 to broadcast Stage 1 Chipnet lifecycle.');
  process.exit(0);
}

if (ownerBal < 50_000n || payerBal < 25_000n) {
  throw new Error(
    `Insufficient Chipnet test funds (need owner >= 50,000 sats and payer >= 25,000 sats; got owner=${ownerBal}, payer=${payerBal})`,
  );
}

const ownerExt = Signer.external(
  {
    wallet: makeStrictExternalWallet('chipnet-owner', ownerKey.privateKey),
    address: ownerKey.address,
    publicKey: ownerKey.publicKey,
    userPrompt: 'Pusaka v2 Stage 1 (Chipnet)',
  },
  provider,
);
const payerExt = Signer.external(
  {
    wallet: makeStrictExternalWallet('chipnet-payer', payerKey.privateKey),
    address: payerKey.address,
    publicKey: payerKey.publicKey,
    userPrompt: 'Pusaka v2 Deposit (Chipnet)',
  },
  provider,
);

const heirs = heirKeys.slice(0, 6).map((h: any, i: number) => ({ pkh: h.pkh, share: FARAID[i] }));

const { handle, metadata, deployTx } = await deployWalletBalancePlan({
  ownerSigner: ownerExt,
  period: PERIOD,
  feeBudget: FEE_BUDGET,
  firstDeadline: mtp + PERIOD,
  heirs,
  initialBalance: 0n,
});
log('Deployed WalletBalanceProof category:', metadata.categoryId, 'tx:', deployTx?.txid);
log('  inboxAddress:', metadata.inboxAddress);

// Ordinary deposit 1 -> inboxAddress
const payerUtxos1 = (await payerExt.getUtxos())
  .filter((u) => !u.token)
  .sort((a, b) => Number(b.satoshis - a.satoshis));
const dep1Amt = 15_000n;
const dep1 = await new TransactionBuilder({ provider })
  .addInput(payerUtxos1[0], payerExt.unlockP2PKH())
  .addOutput({ to: metadata.inboxAddress, amount: dep1Amt })
  .addOutput({ to: payerExt.address, amount: payerUtxos1[0].satoshis - dep1Amt - 400n })
  .send();
log('Ordinary deposit 1 tx:', dep1.txid);

// Permissionless self-sweep -> satoshiContainer
const sweep1 = await sweepInbox(handle, { mode: 'self' });
log('Permissionless self-sweep tx:', sweep1.txid, 'bytes:', sweep1.txBytes, 'fee:', sweep1.feePaid.toString(), 'container:', sweep1.containerSatsAfter.toString());
if (sweep1.usedDummyFunder) throw new Error('Unexpected dummy funder on Chipnet sweep1');

// Owner-approved partial send + atomic deadline update
const lt1 = Number((await medianTimePast(provider)) - 1n);
const send1 = await sendProtected(handle, ownerExt, payerExt.address, 6_000n, {
  locktime: lt1,
  autoSweepInbox: false,
});
log('Partial send 1 tx:', send1.send.txid, 'bytes:', send1.send.txBytes, 'fee:', send1.send.feePaid.toString(), 'containerAfter:', send1.send.containerAfter.toString(), 'deadline:', send1.send.newDeadline.toString());
if (send1.send.usedDummyFunder) throw new Error('Unexpected dummy funder on Chipnet send1');

// Second ordinary deposit -> fresh session recover -> repeat partial send
const payerUtxos2 = (await payerExt.getUtxos())
  .filter((u) => !u.token && u.satoshis >= 9_000n)
  .sort((a, b) => Number(b.satoshis - a.satoshis));
if (payerUtxos2.length === 0) throw new Error('No payer UTXO >= 9,000 sats for deposit 2');
const dep2Amt = 8_000n;
const dep2 = await new TransactionBuilder({ provider })
  .addInput(payerUtxos2[0], payerExt.unlockP2PKH())
  .addOutput({ to: metadata.inboxAddress, amount: dep2Amt })
  .addOutput({ to: payerExt.address, amount: payerUtxos2[0].satoshis - dep2Amt - 400n })
  .send();
log('Ordinary deposit 2 tx:', dep2.txid);

const recoveredJson: WalletBalancePlanMetadata = JSON.parse(JSON.stringify(metadata));
const recovered = await attachWalletBalancePlan(recoveredJson, ownerExt);
const inspected = await inspectWalletBalancePlan(recovered);
log('Recovered fresh session -> container:', inspected.containerBalance.toString(), 'inbox:', inspected.inboxBalance.toString());

const lt2 = Number((await medianTimePast(provider)) - 1n);
const send2 = await sendProtected(recovered, ownerExt, payerExt.address, 5_000n, {
  locktime: lt2,
  sweepMode: 'self',
});
log('Sweep 2 tx:', send2.sweep?.txid, 'bytes:', send2.sweep?.txBytes, 'fee:', send2.sweep?.feePaid.toString());
log('Send 2 tx:', send2.send.txid, 'bytes:', send2.send.txBytes, 'fee:', send2.send.feePaid.toString(), 'containerAfter:', send2.send.containerAfter.toString(), 'deadline:', send2.send.newDeadline.toString());
if (send2.send.usedDummyFunder || send2.sweep?.usedDummyFunder) {
  throw new Error('Unexpected dummy funder on Chipnet send2');
}
log('Final Chipnet balances -> owner:', (await sumBalance(provider, ownerKey.address)).toString(), 'payer:', (await sumBalance(provider, payerKey.address)).toString());
process.exit(0);
