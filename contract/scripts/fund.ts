// Sends Chipnet test coins from test account #0 to another test account, as one or several coins.
// Usage: FUND_TO=1 FUND_SATS=60000 FUND_COINS=1 node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/fund.ts --network chipnet
import { ethers } from '@solidcash/solidhat/hardhat3';
import { SignatureTemplate, TransactionBuilder } from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';

const provider = new ElectrumNetworkProvider('chipnet');
const keys: any[] = await ethers.getSigners(8);
const from = keys[0];
const to = process.env.FUND_ADDR ? { address: process.env.FUND_ADDR } : keys[Number(process.env.FUND_TO ?? 1)];
const sats = BigInt(process.env.FUND_SATS ?? 60000);
const coins = Number(process.env.FUND_COINS ?? 1);
const FEE = 1000n;

const utxos = (await provider.getUtxos(from.address)).filter((u) => !u.token).sort((a, b) => Number(b.satoshis - a.satoshis));
const input = utxos[0];
const unlocker = new SignatureTemplate(from.privateKey).unlockP2PKH();
const builder = new TransactionBuilder({ provider }).addInput(input, unlocker);
for (let i = 0; i < coins; i++) builder.addOutput({ to: to.address, amount: sats / BigInt(coins) });
builder.addOutput({ to: from.address, amount: input.satoshis - sats - FEE });
const tx = await builder.send();
console.log('funded', to.address, sats, 'in', coins, 'coin(s), tx', tx.txid);
process.exit(0);
