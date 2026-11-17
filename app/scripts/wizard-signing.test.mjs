// Offline protocol checks: real SDK signer and WizardConnect JSON transport, with local test keys only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { binToHex, decodeTransactionBch, encodeTransaction, hexToBin, secp256k1 } from '@bitauth/libauth';
import { DappConnectionManager } from '@wizardconnect/dapp';
import { RelayClient, toBigInt, toUint8Array } from '@wizardconnect/core';
import { SignatureTemplate } from '@solidcash/solidcash';
import { applyExternalSignatures, externallySignedUnlocker } from '@solidcash/solidcash/walletconnect';
import { WizardWallet } from '../src/lib/chain/wizard.ts';

function keyAt(child, index) {
  const key = new Uint8Array(32);
  key[31] = 1 + child * 20 + Number(index);
  return key;
}
const pubAt = (child, index) => secp256k1.derivePublicKeyCompressed(keyAt(child, index));

function sourceFromWire(source) {
  return {
    ...source,
    outpointTransactionHash: toUint8Array(source.outpointTransactionHash),
    unlockingBytecode: toUint8Array(source.unlockingBytecode),
    lockingBytecode: toUint8Array(source.lockingBytecode),
    valueSatoshis: toBigInt(source.valueSatoshis),
    ...(source.token && { token: {
      ...source.token,
      category: toUint8Array(source.token.category),
      amount: toBigInt(source.token.amount),
      ...(source.token.nft && { nft: {
        ...source.token.nft,
        commitment: toUint8Array(source.token.nft.commitment),
      } }),
    } }),
  };
}

function harness({ tamper = false } = {}) {
  const manager = new DappConnectionManager('Pusaka', undefined, { session: false });
  manager.hasPath = (child) => child === 0 || child === 1;
  manager.getPubkey = pubAt;
  manager.nextSequence = () => 1;
  const messages = [];
  manager.sendSignRequest = async (message) => {
    // Exercise the library's own JSON serialization, without a relay connection or broadcast.
    let wire;
    await RelayClient.prototype.publishMessage.call({
      async publishSerialized(_action, serialized) { wire = JSON.parse(serialized); },
    }, message);
    messages.push(wire);
    const transaction = decodeTransactionBch(hexToBin(wire.transaction.transaction));
    assert.equal(typeof transaction, 'object');
    const sourceOutputs = wire.transaction.sourceOutputs.map(sourceFromWire);
    for (const [inputIndex, path, index] of wire.inputPaths) {
      const unlocker = new SignatureTemplate(keyAt(path === 'change' ? 1 : 0, index)).unlockP2PKH();
      transaction.inputs[inputIndex].unlockingBytecode = unlocker.generateUnlockingBytecode({
        transaction, sourceOutputs, inputIndex,
      });
    }
    if (tamper) transaction.outputs[0].valueSatoshis += 1n;
    return { signedTransaction: binToHex(encodeTransaction(transaction)) };
  };
  const wallet = new WizardWallet(manager, 'mainnet');
  const signer = wallet.signer('Pusaka: test signing');
  const receive = wallet.derivedAddresses().find((a) => a.path === 'receive' && a.index === 0);
  const change = wallet.derivedAddresses().find((a) => a.path === 'change' && a.index === 2);
  const token = {
    category: new Uint8Array(32).fill(0xab),
    amount: (1n << 60n) + 1n,
    nft: { capability: 'mutable', commitment: Uint8Array.of(0, 0xff, 0x80) },
  };
  const transaction = {
    version: 2,
    locktime: 1_763_381_234,
    inputs: [0, 1, 2].map((index) => ({
      outpointTransactionHash: new Uint8Array(32).fill(index + 1),
      outpointIndex: index,
      sequenceNumber: 0xfffffffe,
      unlockingBytecode: new Uint8Array(),
    })),
    outputs: [
      { lockingBytecode: hexToBin(receive.lockHex), valueSatoshis: 10_000n },
      { lockingBytecode: Uint8Array.of(0x51), valueSatoshis: 1_000n, token },
    ],
  };
  const sourceOutputs = transaction.inputs.map((input, index) => ({
    ...input,
    valueSatoshis: 25_000n,
    lockingBytecode: index === 0 ? hexToBin(receive.lockHex) : index === 2 ? hexToBin(change.lockHex) : Uint8Array.of(0x51),
    ...(index === 1 && { token }),
  }));
  return { wallet, signer, messages, transaction, sourceOutputs };
}

test('wallet request crosses the real JSON transport without changing transaction bytes or source values', async () => {
  const { signer, messages, transaction, sourceOutputs } = harness();
  sourceOutputs[1].contract = {
    redeemScript: Uint8Array.of(0x51),
    abiFunction: { name: 'distribute', inputs: [] },
    artifact: { contractName: 'Pusaka', bytecode: '51' },
  };
  const originalHex = binToHex(encodeTransaction(transaction));
  const originalSources = structuredClone(sourceOutputs);
  await signer.signTransaction({ transaction, sourceOutputs, broadcast: true, userPrompt: 'SDK prompt' });
  assert.equal(messages.length, 1);
  const message = messages[0];
  assert.equal(message.action, 'sign_transaction_request');
  assert.deepEqual(message.inputPaths, [[0, 'receive', 0], [2, 'change', 2]]);
  assert.equal(message.transaction.transaction, originalHex);
  assert.equal(message.transaction.broadcast, false);
  assert.equal(message.transaction.userPrompt, 'Pusaka: test signing');
  message.transaction.sourceOutputs.forEach((source, index) => {
    const restored = sourceFromWire(source);
    for (const field of ['outpointTransactionHash', 'outpointIndex', 'sequenceNumber', 'unlockingBytecode', 'lockingBytecode', 'valueSatoshis', 'token']) {
      assert.deepEqual(restored[field], sourceOutputs[index][field], `source ${index}: ${field}`);
    }
  });
  assert.deepEqual(toUint8Array(message.transaction.sourceOutputs[1].contract.redeemScript), sourceOutputs[1].contract.redeemScript);
  assert.deepEqual(message.transaction.sourceOutputs[1].contract.artifact, sourceOutputs[1].contract.artifact);
  assert.equal(binToHex(encodeTransaction(transaction)), originalHex);
  assert.deepEqual(sourceOutputs, originalSources);
});

test('SDK accepts wallet signatures after the wire round trip and preserves the covenant input', async () => {
  const { signer, messages, transaction, sourceOutputs } = harness();
  transaction.inputs[1].unlockingBytecode = Uint8Array.of(0x51, 0x52);
  const unlocker = (index) => externallySignedUnlocker({ lockingBytecode: sourceOutputs[index].lockingBytecode, signer });
  const signed = await applyExternalSignatures([unlocker(0), undefined, unlocker(2)], transaction, sourceOutputs);
  assert.equal(messages.length, 1);
  assert.ok(signed.inputs[0].unlockingBytecode.length > 0);
  assert.ok(signed.inputs[2].unlockingBytecode.length > 0);
  assert.deepEqual(signed.inputs[1].unlockingBytecode, transaction.inputs[1].unlockingBytecode);
  assert.deepEqual(signed.outputs, transaction.outputs);
  assert.equal(signed.locktime, transaction.locktime);
});

test('SDK still refuses a wallet response that changes an output', async () => {
  const { signer, transaction, sourceOutputs } = harness({ tamper: true });
  const unlocker = (index) => externallySignedUnlocker({ lockingBytecode: sourceOutputs[index].lockingBytecode, signer });
  await assert.rejects(
    applyExternalSignatures([unlocker(0), undefined, unlocker(2)], transaction, sourceOutputs),
    /changed output 0/,
  );
});
