// Recover public verification metadata from accepted Chipnet transactions after
// interruption. Only the existing test fixture owner's public identity is used.
import { writeFileSync } from 'node:fs';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { binToHex, decodeAuthenticationInstructions, decodeTransactionBch, hexToBin, sha256 } from '@bitauth/libauth';
import {
  attachPusakaV2Plan,
  buildPusakaV2Metadata,
  decodePlanStateCommitment,
  decodePolicyBytes,
  discoverPusakaV2State,
  instantiatePusakaV2Contracts,
} from './pusaka-v2.ts';

function txidArgument(name: string): string {
  const value = process.env[name] ?? '';
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must name an existing Chipnet transaction`);
  return value;
}

async function main() {
  if (network.name !== 'chipnet') throw new Error('Checkpoint recovery is Chipnet-only');
  const genesisTxid = txidArgument('PUSAKA_V2_RECOVER_GENESIS_TXID');
  const policyTxid = txidArgument('PUSAKA_V2_RECOVER_POLICY_TXID');
  const finalizeTxid = txidArgument('PUSAKA_V2_RECOVER_FINALIZE_TXID');
  const provider = new ElectrumNetworkProvider('chipnet');
  const [owner] = await ethers.getSigners(1);
  async function transaction(txid: string) {
    const decoded = decodeTransactionBch(hexToBin(await provider.getRawTransaction(txid)));
    if (typeof decoded === 'string') throw new Error(decoded);
    return decoded;
  }
  const [genesis, update, payout] = await Promise.all([
    transaction(genesisTxid), transaction(policyTxid), transaction(finalizeTxid),
  ]);
  const category = binToHex(genesis.inputs[0].outpointTransactionHash);
  const contracts = instantiatePusakaV2Contracts({ provider, planCategoryHex: category, ownerPkh: owner.pkh });
  if (binToHex(genesis.outputs[0].lockingBytecode) !== binToHex(contracts.planLockingBytecode)) {
    throw new Error('Genesis does not match the derived fixture plan');
  }
  const state = await discoverPusakaV2State(contracts);
  const policyBytes = decodeAuthenticationInstructions(update.inputs[0].unlockingBytecode)
    .flatMap(instruction => 'data' in instruction && instruction.data instanceof Uint8Array ? [instruction.data] : [])
    .find(data => binToHex(sha256.hash(sha256.hash(data))) === state.onChainPolicyHashHex);
  if (!policyBytes) throw new Error('Policy update does not reveal the current committed policy');
  const initial = decodePlanStateCommitment(genesis.outputs[0].token!.nft!.commitment);
  const policy = decodePolicyBytes(policyBytes);
  const metadata = buildPusakaV2Metadata({
    contracts, policy, createdAtLocktime: initial.deadline - initial.inactivityPeriodSeconds,
  });
  await attachPusakaV2Plan(metadata, provider);
  if (state.status !== 'PAID_OUT') throw new Error(`Expected existing payout; found ${state.status}`);
  const checkpoint = {
    metadata,
    openReviewTxid: binToHex(payout.inputs[1].outpointTransactionHash),
    openedAtMtp: 0, // Historical timing is recorded separately; this payout already succeeded.
    effectiveReviewSeconds: policy.effectiveReviewSeconds,
    finalizeTxid,
  };
  writeFileSync('scripts/v2/.pusaka-v2-chipnet-checkpoint.json', JSON.stringify(checkpoint, null, 2));
  console.log('Recovered verified public checkpoint:', {
    category, status: state.status, protectedSats: state.planBalanceSats.toString(),
  });
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
