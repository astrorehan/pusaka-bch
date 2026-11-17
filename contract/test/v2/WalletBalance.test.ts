import { describe, expect, it } from 'vitest';
import { ethers } from '@solidcash/solidhat/hardhat3';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import {
  binToHex,
  encodeCashAddress,
  encodeTransaction,
  generatePrivateKey,
  hash160,
  secp256k1,
} from '@bitauth/libauth';
import {
  Contract,
  SignatureTemplate,
  Signer,
  TransactionBuilder,
  randomUtxo,
  type ExternalTransactionSigner,
} from '@solidcash/solidcash';
import { buildSatoshiContainerCovenantScript } from '@solidcash/utils';
import {
  attachWalletBalancePlan,
  buildKnownUtxoMap,
  createSatoshiContainerMergeUnlocker,
  deployWalletBalancePlan,
  getWalletBalanceArtifacts,
  inspectTransactionAccounting,
  inspectWalletBalancePlan,
  sendProtected,
  sweepInbox,
  type WalletBalancePlanMetadata,
} from '../../scripts/v2/wallet-balance-helper.js';

const DAY = 86400n;
const PERIOD = 30n * DAY;
const FEE_BUDGET = 2000n;
const TOTAL_SHARES = 120n;
const FARAID_SHARES = [15n, 20n, 20n, 26n, 26n, 13n];

const lockTimeNow = async () => Number(BigInt(await time.latest()) - 1n);

interface ExternalWalletAuditLog {
  txIndex: number;
  inputsTotal: number;
  signedOwnInputs: number;
  covenantInputsZeroedInRequest: number;
  userPrompt?: string;
}

/**
 * Strict bch_signTransaction stand-in wallet:
 * - Verifies all non-wallet inputs have empty unlockingBytecode in the request (never asks wallet to sign covenants)
 * - Signs ONLY its own P2PKH inputs
 * - Leaves transaction structure, locktime, outputs, and covenant inputs unmodified
 */
function createStrictExternalWallet(
  privateKey: Uint8Array,
  auditLog: ExternalWalletAuditLog[],
): ExternalTransactionSigner {
  const template = new SignatureTemplate(privateKey);
  const unlocker = template.unlockP2PKH();
  const ownLockHex = binToHex(unlocker.generateLockingBytecode());

  return {
    async signTransaction(request) {
      const { transaction, sourceOutputs, userPrompt } = request;
      if (sourceOutputs.length !== transaction.inputs.length) {
        throw new Error('bch_signTransaction sourceOutputs length mismatch');
      }

      let signedOwnInputs = 0;
      let covenantInputsZeroedInRequest = 0;

      const inputs = transaction.inputs.map((input, inputIndex) => {
        const srcLockHex = binToHex(sourceOutputs[inputIndex].lockingBytecode);
        if (input.unlockingBytecode.length !== 0) {
          throw new Error(
            `External signing invariant failed: input ${inputIndex} must be empty in wc request`,
          );
        }
        if (srcLockHex !== ownLockHex) {
          covenantInputsZeroedInRequest++;
          return input;
        }
        signedOwnInputs++;
        return {
          ...input,
          unlockingBytecode: unlocker.generateUnlockingBytecode({
            transaction,
            sourceOutputs,
            inputIndex,
          }),
        };
      });

      if (signedOwnInputs === 0) {
        throw new Error('Wallet asked to sign transaction with 0 own P2PKH inputs');
      }

      auditLog.push({
        txIndex: auditLog.length,
        inputsTotal: transaction.inputs.length,
        signedOwnInputs,
        covenantInputsZeroedInRequest,
        userPrompt,
      });

      return {
        signedTransaction: binToHex(encodeTransaction({ ...transaction, inputs })),
      };
    },
  };
}

function makeFreshLocalPerson(provider: any) {
  const privateKey = generatePrivateKey();
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey) as Uint8Array;
  const pkh = hash160(publicKey);
  const address = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
  const signer = new Signer(privateKey, provider);
  return { privateKey, publicKey, pkh, address, signer };
}

function distributeCall(master: any, heirs: any[], shares: bigint[], pot: bigint, total: bigint) {
  let call = master.call.distribute();
  heirs.forEach((h, i) => {
    call = call.transfer(h.getLockingBytecode(), (pot * shares[i]) / total);
  });
  return call;
}

describe('WalletBalanceProof Stage 1 (Mocknet VM + strict external-signer stand-in)', { timeout: 420_000 }, () => {
  it('executes full Stage 1 flow: empty deploy -> ordinary receive -> permissionless sweep (no liveness renewal) -> partial send -> multi-UTXO deposits -> repeat send -> fresh-session recovery -> strict external signer', async () => {
    const signers = await ethers.getSigners(10);
    const [ownerLocal, payer1, payer2, stranger, ...heirSigners] = signers as any[];
    const heirs = heirSigners.slice(0, 6);
    const provider = ownerLocal.provider;

    const auditLog: ExternalWalletAuditLog[] = [];
    const ownerExternal = Signer.external(
      {
        wallet: createStrictExternalWallet(ownerLocal.privateKey, auditLog),
        address: ownerLocal.address,
        publicKey: ownerLocal.publicKey,
        userPrompt: 'Pusaka v2 Stage 1',
      },
      provider,
    );

    const recipient1 = makeFreshLocalPerson(provider);
    const recipient2 = makeFreshLocalPerson(provider);
    const recipient3 = makeFreshLocalPerson(provider);

    const t0 = BigInt(await time.latest());
    const initialDeadline = t0 + PERIOD;

    const ownerPreDeployUtxos = await ownerExternal.getUtxos();
    // 1. Deploy starting empty (0 protected balance) using Signer.external
    const { handle, metadata, deployTx } = await deployWalletBalancePlan({
      ownerSigner: ownerExternal,
      period: PERIOD,
      feeBudget: FEE_BUDGET,
      firstDeadline: initialDeadline,
      heirs: heirs.map((h, i) => ({ pkh: h.pkh, share: FARAID_SHARES[i] })),
      initialBalance: 0n,
    });
    expect(deployTx?.txid).toBeTruthy();
    expect(auditLog.length).toBeGreaterThanOrEqual(1);

    const deployAcct = await inspectTransactionAccounting(
      provider,
      deployTx!.txid,
      buildKnownUtxoMap([
        { utxos: ownerPreDeployUtxos, lockHex: binToHex(ownerExternal.getLockingBytecode()) },
      ]),
    );
    expect(deployAcct.usedDummyFunder).toBe(false);

    let state0 = await inspectWalletBalancePlan(handle);
    expect(state0.containerBalance).toBe(0n);
    expect(state0.inboxBalance).toBe(0n);
    expect(state0.deadline).toBe(initialDeadline);

    // 2. Ordinary incoming transfer #1 -> metadata.inboxAddress (no owner involvement)
    await time.increase(5n * DAY);
    const deposit1Amount = 400_000n;
    const payer1Utxos = (await payer1.getUtxos()).filter((u: any) => !u.token);
    const dep1Tx = await new TransactionBuilder({ provider })
      .addInput(payer1Utxos[0], payer1.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: deposit1Amount })
      .addOutput({ to: payer1.address, amount: payer1Utxos[0].satoshis - deposit1Amount - 500n })
      .send();
    expect(dep1Tx.txid).toBeTruthy();

    // Deposit must NOT advance deadline
    let stateAfterDep1 = await inspectWalletBalancePlan(handle);
    expect(stateAfterDep1.inboxBalance).toBe(deposit1Amount);
    expect(stateAfterDep1.containerBalance).toBe(0n);
    expect(stateAfterDep1.totalCoveredBalance).toBe(deposit1Amount);
    expect(stateAfterDep1.deadline).toBe(initialDeadline);

    // 3. Permissionless self-funded sweep by stranger (0 owner sigs, creates container UTXO from 0!)
    const sweep1 = await sweepInbox(handle, { mode: 'self' });
    expect(sweep1.mode).toBe('self');
    expect(sweep1.usedDummyFunder).toBe(false);
    expect(sweep1.containerSatsBefore).toBe(0n);
    expect(sweep1.containerSatsAfter).toBe(deposit1Amount - sweep1.feePaid);
    expect(sweep1.feePaid).toBeLessThanOrEqual(400n + handle.perInputFeeCap);

    // Sweep must NOT advance deadline
    const stateAfterSweep1 = await inspectWalletBalancePlan(handle);
    expect(stateAfterSweep1.containerBalance).toBe(deposit1Amount - sweep1.feePaid);
    expect(stateAfterSweep1.inboxBalance).toBe(0n);
    expect(stateAfterSweep1.deadline).toBe(initialDeadline);

    // 4. Owner-approved partial payment via strict external signer + atomic deadline renewal
    const lt1 = await lockTimeNow();
    const pay1Amount = 150_000n;
    const { send: send1 } = await sendProtected(
      handle,
      ownerExternal,
      recipient1.address,
      pay1Amount,
      { locktime: lt1 },
    );
    expect(send1.usedDummyFunder).toBe(false);
    expect(send1.containerAfter).toBe(send1.containerBefore - pay1Amount);
    expect(send1.newDeadline).toBe(BigInt(lt1) + PERIOD);
    expect(send1.newDeadline).toBeGreaterThan(initialDeadline);

    const rec1Utxos = await provider.getUtxos(recipient1.address);
    expect(rec1Utxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n)).toBe(pay1Amount);

    // 5. Concurrent ordinary incoming deposits (#2a and #2b) after spending
    await time.increase(4n * DAY);
    const deadlineBeforeConcurrentDeposits = send1.newDeadline;

    const dep2aAmount = 120_000n;
    const p1Coin = (await payer1.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(p1Coin, payer1.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: dep2aAmount })
      .addOutput({ to: payer1.address, amount: p1Coin.satoshis - dep2aAmount - 500n })
      .send();

    const dep2bAmount = 80_000n;
    const p2Coin = (await payer2.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(p2Coin, payer2.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: dep2bAmount })
      .addOutput({ to: payer2.address, amount: p2Coin.satoshis - dep2bAmount - 500n })
      .send();

    const stateBeforeSend2 = await inspectWalletBalancePlan(handle);
    expect(stateBeforeSend2.inboxUtxos.length).toBe(2);
    expect(stateBeforeSend2.inboxBalance).toBe(dep2aAmount + dep2bAmount);
    expect(stateBeforeSend2.deadline).toBe(deadlineBeforeConcurrentDeposits);

    // 6. Repeat partial payment (auto-sweeps both concurrent inbox UTXOs in sponsored mode via external signer, then sends!)
    const lt2 = await lockTimeNow();
    const pay2Amount = 220_000n;
    const res2 = await sendProtected(
      handle,
      ownerExternal,
      recipient2.address,
      pay2Amount,
      { locktime: lt2, sweepMode: 'sponsored' },
    );
    expect(res2.sweep).toBeDefined();
    expect(res2.sweep!.mode).toBe('sponsored');
    expect(res2.sweep!.usedDummyFunder).toBe(false);
    // Sponsored sweep preserves 100% of inbox + existing container!
    expect(res2.sweep!.containerSatsAfter).toBe(
      stateBeforeSend2.containerBalance + dep2aAmount + dep2bAmount,
    );
    expect(res2.send.usedDummyFunder).toBe(false);
    expect(res2.send.containerAfter).toBe(res2.sweep!.containerSatsAfter - pay2Amount);
    expect(res2.send.newDeadline).toBe(BigInt(lt2) + PERIOD);

    const rec2Utxos = await provider.getUtxos(recipient2.address);
    expect(rec2Utxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n)).toBe(pay2Amount);
    console.info(
      'Stage1 flow telemetry:',
      JSON.stringify({
        deployBytes: deployAcct.txBytes,
        deployFee: deployAcct.feePaid.toString(),
        sweep1SelfBytes: sweep1.txBytes,
        sweep1SelfFee: sweep1.feePaid.toString(),
        send1Bytes: send1.txBytes,
        send1Fee: send1.feePaid.toString(),
        sweep2Sponsored2InBytes: res2.sweep!.txBytes,
        sweep2Sponsored2InFee: res2.sweep!.feePaid.toString(),
        send2Bytes: res2.send.txBytes,
        send2Fee: res2.send.feePaid.toString(),
      }),
    );

    // 7. Reconstruct completely from JSON metadata in a fresh handle / read-only + fresh Signer.external session
    const jsonMetadata: WalletBalancePlanMetadata = JSON.parse(JSON.stringify(metadata));
    const readOnlyHandle = await attachWalletBalancePlan(jsonMetadata, provider);
    const readView = await inspectWalletBalancePlan(readOnlyHandle);
    expect(readView.inboxAddress).toBe(metadata.inboxAddress);
    expect(readView.satoshiContainerAddress).toBe(metadata.satoshiContainerAddress);
    expect(readView.containerBalance).toBe(res2.send.containerAfter);
    expect(readView.deadline).toBe(res2.send.newDeadline);
    expect(readView.heirs.length).toBe(6);

    const freshAuditLog: ExternalWalletAuditLog[] = [];
    const freshOwnerExternal = Signer.external(
      {
        wallet: createStrictExternalWallet(ownerLocal.privateKey, freshAuditLog),
        address: ownerLocal.address,
        publicKey: ownerLocal.publicKey,
        userPrompt: 'Recovered session send',
      },
      provider,
    );
    const recoveredHandle = await attachWalletBalancePlan(jsonMetadata, freshOwnerExternal);

    await time.increase(2n * DAY);
    const lt3 = await lockTimeNow();
    const pay3Amount = 90_000n;
    const res3 = await sendProtected(
      recoveredHandle,
      freshOwnerExternal,
      recipient3.address,
      pay3Amount,
      { locktime: lt3 },
    );
    expect(res3.send.usedDummyFunder).toBe(false);
    expect(res3.send.containerAfter).toBe(res2.send.containerAfter - pay3Amount);
    expect(res3.send.newDeadline).toBe(BigInt(lt3) + PERIOD);
    expect(freshAuditLog.length).toBe(1);
    expect(freshAuditLog[0].covenantInputsZeroedInRequest).toBeGreaterThanOrEqual(2);
    expect(freshAuditLog[0].signedOwnInputs).toBe(1);

    // Regression: owner holding a stale sub-fee plain UTXO (9,000 sats) alongside a funded UTXO
    // must still select the funded coin via withFundedPlainUtxoPreference without hitting min relay fee.
    await provider.addUtxo(
      ownerLocal.address,
      randomUtxo({ satoshis: 9_000n, vout: 1 }),
    );
    await time.increase(DAY);
    const lt4 = await lockTimeNow();
    const res4 = await sendProtected(
      recoveredHandle,
      freshOwnerExternal,
      recipient3.address,
      10_000n,
      { locktime: lt4, autoSweepInbox: false },
    );
    expect(res4.send.usedDummyFunder).toBe(false);
    expect(res4.send.ownerInputsSats).toBeGreaterThanOrEqual(11_000n);
    expect(res4.send.containerAfter).toBe(res3.send.containerAfter - 10_000n);

    // Verify stranger cannot hijack send via recovered handle either
    const strangerHandle = recoveredHandle.master.connect(stranger);
    await expect(
      (strangerHandle as any).call
        .send(stranger.getLockingBytecode(), 10_000n)
        .setLocktime(await lockTimeNow()),
    ).toBeRevertedWith(/owner coin/);
  });

  it('accounts exact owner coin input, returned P2PKH change, and fees when ~99% of owner funds are protected (3 consecutive sends without top-up or dummy funders)', async () => {
    const signers = await ethers.getSigners(8);
    const [funderSource, , ...heirSigners] = signers as any[];
    const heirs = heirSigners.slice(0, 6);
    const provider = funderSource.provider;

    // Fresh owner with strictly controlled UTXOs:
    // - UTXO A (deploy + initial funding): 5,030,000 sats -> 5,000,000 protected in vault
    // - After deploy, isolate owner to ONLY ONE small persistent P2PKH fee coin of 45,000 sats (~0.9% of 5M protected -> >99.1% protected!)
    // - Real WalletBalanceProof script is ~8.7 KB (~10 KB tx), so each send pays ~10,026 sats in 1 sat/B miner fee.
    const ownerPerson = makeFreshLocalPerson(provider);
    const recipient = makeFreshLocalPerson(provider);

    const funderUtxo = (await funderSource.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(funderUtxo, funderSource.unlockP2PKH())
      .addOutput({ to: ownerPerson.address, amount: 5_030_000n })
      .addOutput({ to: funderSource.address, amount: funderUtxo.satoshis - 5_030_000n - 500n })
      .send();

    const now = BigInt(await time.latest());
    const { handle } = await deployWalletBalancePlan({
      ownerSigner: ownerPerson.signer,
      period: PERIOD,
      feeBudget: FEE_BUDGET,
      firstDeadline: now + PERIOD,
      heirs: heirs.map((h, i) => ({ pkh: h.pkh, share: FARAID_SHARES[i] })),
      initialBalance: 5_000_000n,
    });

    // Sweep away any deploy change and give owner EXACTLY ONE 45,000-sat P2PKH fee coin (~0.9% of protected balance)
    const leftover = (await ownerPerson.signer.getUtxos()).filter((u: any) => !u.token);
    if (leftover.length > 0) {
      const sweepChangeBuilder = new TransactionBuilder({ provider });
      let total = 0n;
      for (const u of leftover) {
        sweepChangeBuilder.addInput(u, ownerPerson.signer.unlockP2PKH());
        total += u.satoshis;
      }
      sweepChangeBuilder.addOutput({ to: recipient.address, amount: total - 400n });
      await sweepChangeBuilder.send();
    }

    const faucetCoin = (await funderSource.getUtxos()).filter((u: any) => !u.token)[0];
    const persistentFeeCoinSize = 45_000n;
    await new TransactionBuilder({ provider })
      .addInput(faucetCoin, funderSource.unlockP2PKH())
      .addOutput({ to: ownerPerson.address, amount: persistentFeeCoinSize })
      .addOutput({ to: funderSource.address, amount: faucetCoin.satoshis - persistentFeeCoinSize - 500n })
      .send();

    const ownerBeforeSends = (await ownerPerson.signer.getUtxos()).filter((u: any) => !u.token);
    expect(ownerBeforeSends.length).toBe(1);
    expect(ownerBeforeSends[0].satoshis).toBe(persistentFeeCoinSize);

    let expectedFeeCoin = persistentFeeCoinSize;
    const records: Array<{ bytes: number; fee: bigint; netOwnerSpent: bigint; change: bigint }> = [];

    for (let i = 0; i < 3; i++) {
      await time.increase(DAY);
      const { send } = await sendProtected(
        handle,
        ownerPerson.signer,
        recipient.address,
        50_000n,
        { locktime: await lockTimeNow() },
      );

      expect(send.usedDummyFunder).toBe(false);
      expect(send.ownerInputsSats).toBe(expectedFeeCoin);
      expect(send.ownerChangeSats).toBeGreaterThan(0n);
      // Owner coin pays ONLY the real transaction miner fee (~1 sat/B + STB estimate margin), zero carrier leakage or protected-balance skim!
      expect(send.ownerNetSpent).toBe(send.ownerInputsSats - send.ownerChangeSats);
      expect(send.ownerNetSpent).toBe(send.feePaid);
      expect(send.ownerNetSpent).toBeLessThanOrEqual(BigInt(send.txBytes) + 256n);
      expect(send.containerAfter).toBe(send.containerBefore - 50_000n);

      expectedFeeCoin = send.ownerChangeSats;
      records.push({
        bytes: send.txBytes,
        fee: send.feePaid,
        netOwnerSpent: send.ownerNetSpent,
        change: send.ownerChangeSats,
      });

      const currentOwnerUtxos = (await ownerPerson.signer.getUtxos()).filter((u: any) => !u.token);
      expect(currentOwnerUtxos.length).toBe(1);
      expect(currentOwnerUtxos[0].satoshis).toBe(expectedFeeCoin);
    }

    // Confirm protected balance matches exact sum of protected operations (5,000,000 - 3 * 50,000)
    const finalInspection = await inspectWalletBalancePlan(handle);
    expect(finalInspection.containerBalance).toBe(4_850_000n);
    expect(records.length).toBe(3);

    // Also test full-balance send (remaining == 0, drains container to filler) -> re-fund via inbox works!
    await time.increase(DAY);
    const drainRes = await sendProtected(
      handle,
      ownerPerson.signer,
      recipient.address,
      4_850_000n,
      { locktime: await lockTimeNow() },
    );
    expect(drainRes.send.usedDummyFunder).toBe(false);
    // On full drain (remaining == 0), SolidCash emits a 576-sat slot-preserving filler output at the container slot index,
    // paid from the owner's P2PKH coin alongside the miner fee (ownerNetSpent === feePaid + 576n).
    expect(drainRes.send.ownerNetSpent).toBe(drainRes.send.feePaid + 576n);
    expect(drainRes.send.containerAfter).toBe(0n);
    console.info(
      'Stage1 ~99% protected accounting:',
      JSON.stringify({
        sends: records.map((r) => ({
          bytes: r.bytes,
          fee: r.fee.toString(),
          netOwnerSpent: r.netOwnerSpent.toString(),
          change: r.change.toString(),
        })),
        fullDrain: {
          bytes: drainRes.send.txBytes,
          fee: drainRes.send.feePaid.toString(),
          netOwnerSpent: drainRes.send.ownerNetSpent.toString(),
          ownerChangeAfter: drainRes.send.ownerChangeSats.toString(),
        },
      }),
    );

    // Deposit to inbox after full drain & confirm container revives cleanly
    const postDrainCoin = (await funderSource.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(postDrainCoin, funderSource.unlockP2PKH())
      .addOutput({ to: handle.inboxAddress, amount: 75_000n })
      .addOutput({ to: funderSource.address, amount: postDrainCoin.satoshis - 75_000n - 500n })
      .send();
    const reviveSweep = await sweepInbox(handle, { mode: 'self' });
    expect(reviveSweep.containerSatsBefore).toBe(0n);
    expect(reviveSweep.containerSatsAfter).toBe(75_000n - reviveSweep.feePaid);
  });

  it('enforces inheritance without owner help: inactive-period inbox receipts, post-distribute late receipts, and post-withdraw receipts are all distributable to heirs', async () => {
    const signers = await ethers.getSigners(9);
    const [owner, stranger, payer, ...heirSigners] = signers as any[];
    const heirs = heirSigners.slice(0, 6);
    const provider = owner.provider;

    const t0 = BigInt(await time.latest());
    const { handle, metadata } = await deployWalletBalancePlan({
      ownerSigner: owner,
      period: PERIOD,
      feeBudget: FEE_BUDGET,
      firstDeadline: t0 + PERIOD,
      heirs: heirs.map((h, i) => ({ pkh: h.pkh, share: FARAID_SHARES[i] })),
      initialBalance: 500_000n,
    });

    // Advance 28 days, deposit 300,000 to inbox while owner is already unresponsive
    await time.increase(28n * DAY);
    const pCoin = (await payer.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(pCoin, payer.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: 300_000n })
      .addOutput({ to: payer.address, amount: pCoin.satoshis - 300_000n - 500n })
      .send();

    // Still before deadline: distribute MUST fail even after deposit & self-sweep
    const earlySweep = await sweepInbox(handle, { mode: 'self' });
    expect(await handle.master.state.deadline()).toBe(t0 + PERIOD);
    const preDeadlinePot = earlySweep.containerSatsAfter - FEE_BUDGET;
    await expect(
      distributeCall(
        handle.master.connect(stranger),
        heirs,
        FARAID_SHARES,
        preDeadlinePot,
        TOTAL_SHARES,
      ).setLocktime(await lockTimeNow()),
    ).toBeRevertedWith(/./);

    // Owner expires (past deadline); nobody has owner's key, yet another late 200,000 arrives at inbox!
    await time.increase(3n * DAY);
    const pCoin2 = (await payer.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(pCoin2, payer.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: 200_000n })
      .addOutput({ to: payer.address, amount: pCoin2.satoshis - 200_000n - 500n })
      .send();

    // Stranger permissionlessly sweeps & distributes total combined balance to heirs
    await sweepInbox(handle, { mode: 'self' });
    const totalBeforeDist1 = (await inspectWalletBalancePlan(handle)).containerBalance;
    expect(totalBeforeDist1).toBeGreaterThan(998_000n);

    const pot1 = totalBeforeDist1 - FEE_BUDGET;
    const heirBalancesBefore = await Promise.all(
      heirs.map(async (h) =>
        (await provider.getUtxos(h.address)).reduce((s: bigint, u: any) => s + u.satoshis, 0n),
      ),
    );
    const dist1 = await distributeCall(
      handle.master.connect(stranger),
      heirs,
      FARAID_SHARES,
      pot1,
      TOTAL_SHARES,
    )
      .setLocktime(await lockTimeNow())
      .send();
    const paidTotal1 = FARAID_SHARES.reduce((s, sh) => s + (pot1 * sh) / TOTAL_SHARES, 0n);
    const remainderAfterDist1 = totalBeforeDist1 - paidTotal1;
    expect(dist1.events.map((e: any) => e.event)).toContain('Distributed');
    expect((await inspectWalletBalancePlan(handle)).containerBalance).toBe(remainderAfterDist1);

    const heirBalancesAfter1 = await Promise.all(
      heirs.map(async (h) =>
        (await provider.getUtxos(h.address)).reduce((s: bigint, u: any) => s + u.satoshis, 0n),
      ),
    );
    heirs.forEach((_, i) => {
      expect(heirBalancesAfter1[i] - heirBalancesBefore[i]).toBe(
        (pot1 * FARAID_SHARES[i]) / TOTAL_SHARES,
      );
    });

    // Late receipt AFTER distribute() arrives at the previously published inboxAddress. Must NOT strand funds.
    const lateAmount = 60_000n;
    const pCoin3 = (await payer.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(pCoin3, payer.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: lateAmount })
      .addOutput({ to: payer.address, amount: pCoin3.satoshis - lateAmount - 500n })
      .send();

    const lateSweep = await sweepInbox(handle, { mode: 'self' });
    expect(lateSweep.containerSatsBefore).toBe(remainderAfterDist1);
    expect(lateSweep.containerSatsAfter).toBe(remainderAfterDist1 + lateAmount - lateSweep.feePaid);

    const pot2 = lateSweep.containerSatsAfter - FEE_BUDGET;
    await distributeCall(
      handle.master.connect(stranger),
      heirs,
      FARAID_SHARES,
      pot2,
      TOTAL_SHARES,
    )
      .setLocktime(await lockTimeNow())
      .send();

    const heirBalancesAfter2 = await Promise.all(
      heirs.map(async (h) =>
        (await provider.getUtxos(h.address)).reduce((s: bigint, u: any) => s + u.satoshis, 0n),
      ),
    );
    heirs.forEach((_, i) => {
      expect(heirBalancesAfter2[i] - heirBalancesAfter1[i]).toBe(
        (pot2 * FARAID_SHARES[i]) / TOTAL_SHARES,
      );
    });

    // Also verify post-withdraw() late receipt when container was emptied to 0n:
    await handle.master.connect(owner).call.withdraw().send();
    expect((await inspectWalletBalancePlan(handle)).containerBalance).toBe(0n);

    const lateAfterWithdraw = 40_000n;
    const pCoin4 = (await payer.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(pCoin4, payer.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: lateAfterWithdraw })
      .addOutput({ to: payer.address, amount: pCoin4.satoshis - lateAfterWithdraw - 500n })
      .send();
    const reviveAfterWithdraw = await sweepInbox(handle, { mode: 'self' });
    expect(reviveAfterWithdraw.containerSatsBefore).toBe(0n);
    expect(reviveAfterWithdraw.containerSatsAfter).toBe(lateAfterWithdraw - reviveAfterWithdraw.feePaid);

    // Since deadline already passed and owner didn't act, heirs can still claim the revived funds!
    const pot3 = reviveAfterWithdraw.containerSatsAfter - FEE_BUDGET;
    await distributeCall(
      handle.master.connect(stranger),
      heirs,
      FARAID_SHARES,
      pot3,
      TOTAL_SHARES,
    )
      .setLocktime(await lockTimeNow())
      .send();
    const heirBalancesAfter3 = await Promise.all(
      heirs.map(async (h) =>
        (await provider.getUtxos(h.address)).reduce((s: bigint, u: any) => s + u.satoshis, 0n),
      ),
    );
    heirs.forEach((_, i) => {
      expect(heirBalancesAfter3[i] - heirBalancesAfter2[i]).toBe(
        (pot3 * FARAID_SHARES[i]) / TOTAL_SHARES,
      );
    });
  });

  it('rejects adversarial attacks: recipient substitution, container dust violation, backdated locktime regression, forged NFTs, inbox skimming, excessive self-sweep fee, double container merge, and token junk', async () => {
    const signers = await ethers.getSigners(9);
    const [owner, attacker, payer, ...heirSigners] = signers as any[];
    const heirs = heirSigners.slice(0, 6);
    const provider = owner.provider;

    const t0 = BigInt(await time.latest());
    const { handle, metadata } = await deployWalletBalancePlan({
      ownerSigner: owner,
      period: PERIOD,
      feeBudget: FEE_BUDGET,
      firstDeadline: t0 + PERIOD,
      heirs: heirs.map((h, i) => ({ pkh: h.pkh, share: FARAID_SHARES[i] })),
      initialBalance: 100_000n,
    });

    // 1. Metadata tampering check fails closed
    await expect(
      attachWalletBalancePlan(
        { ...metadata, inboxAddress: attacker.address },
        provider,
      ),
    ).rejects.toThrow(/mismatch/i);

    // 2. Stale/backdated locktime in send CANNOT shrink deadline
    const staleLocktime = 500_000_001;
    const resStale = await sendProtected(
      handle,
      owner,
      payer.address,
      10_000n,
      { locktime: staleLocktime, autoSweepInbox: false },
    );
    expect(resStale.send.newDeadline).toBe(t0 + PERIOD); // preserved, never regressed!

    // 3. Dust / invalid script / remainder below 576 checks in send()
    await expect(
      (handle.master.connect(owner) as any).call
        .send(payer.getLockingBytecode(), 545n)
        .transfer(payer.getLockingBytecode(), 545n)
        .setLocktime(await lockTimeNow()),
    ).toBeRevertedWith(/amount below dust|less than the required minimum.*546/);

    await expect(
      (handle.master.connect(owner) as any).call
        .send(new Uint8Array([0x51]), 1000n)
        .transfer(new Uint8Array([0x51]), 1000n)
        .setLocktime(await lockTimeNow()),
    ).toBeRevertedWith(/unsupported recipient script/);

    // Remaining 90_000; sending 89_500 leaves 500 < 576 container dust -> fails closed at container dust threshold (576)
    const curState = await handle.master.getState();
    await expect(
      (handle.master.connect(owner) as any).call
        .send(payer.getLockingBytecode(), 89_500n)
        .transfer(payer.getLockingBytecode(), 89_500n)
        .setLocktime(await lockTimeNow()),
    ).rejects.toThrow(/below dust threshold \(576\)|protected change below container dust/);

    await expect(
      (handle.master.connect(owner) as any).call
        .send(payer.getLockingBytecode(), 89_500n)
        .transfer(payer.getLockingBytecode(), 89_500n)
        .setState({ deadline: curState.deadline, heirs: curState.heirs })
        .setLocktime(await lockTimeNow()),
    ).rejects.toThrow(/below dust threshold \(576\)|protected change below container dust/);

    // Recipient substitution attack: arg claims payer, output attempts to pay attacker -> reverts!
    await expect(
      (handle.master.connect(owner) as any).call
        .send(payer.getLockingBytecode(), 5_000n)
        .transfer(attacker.getLockingBytecode(), 5_000n)
        .setLocktime(await lockTimeNow()),
    ).toBeRevertedWith(/./);

    // 4. Forged NFT category-confusion attack on satoshiContainer flag=1 path:
    // Mint a DIFFERENT categoryId minting NFT at a forged lock matching WalletBalanceProof code
    // and try spending our real satoshiContainer UTXO with flag=1!
    const containerUtxos = await provider.getUtxos(handle.satoshiContainerAddress);
    const realContainerUtxo = containerUtxos.find((u: any) => !u.token)!;
    const { proofArtifact } = getWalletBalanceArtifacts();
    const forgedContract = new Contract(
      proofArtifact,
      [attacker.pkh, PERIOD, TOTAL_SHARES, FEE_BUDGET],
      { provider, addressType: 'p2sh32' },
    );
    const forgedNftUtxo = await provider.addUtxo(
      forgedContract.tokenAddress,
      randomUtxo({
        satoshis: 1000n,
        token: {
          category: 'aa'.repeat(32), // wrong category!
          amount: 0n,
          nft: { capability: 'minting', commitment: '' },
        },
      }),
    );
    const atkCoin = (await attacker.getUtxos()).filter((u: any) => !u.token)[0];
    const covenantScript = buildSatoshiContainerCovenantScript(
      new Uint8Array(Buffer.from(metadata.categoryId, 'hex')),
      new Uint8Array(Buffer.from(handle.master.inner.lockingBytecode, 'hex')),
      { masterRetires: false },
    );
    const forgedContainerArtifact = {
      contractName: 'ForgedContainerTest',
      constructorInputs: [],
      abi: [{ name: 'spend', inputs: [{ name: 'flag', type: 'bigint' }, { name: 'masterInputIndex', type: 'bigint' }] }],
      bytecode: '',
      source: '',
      compiler: { name: 'solidc', version: '0.50.0' },
      updatedAt: '',
    };
    const forgedMasterLock = new Uint8Array(Buffer.from(handle.master.inner.lockingBytecode, 'hex'));
    expect(forgedMasterLock.length).toBe(35);
    expect(forgedNftUtxo).toBeDefined();
    expect(covenantScript.length).toBeGreaterThan(0);
    // Try unlocking real container UTXO with flag=1 pointing to attacker's forged minting NFT (or attacker P2PKH)
    const flag1Unlocker = (await import('@solidcash/solidcash/stateful')).createCovenantContractUnlocker(
      handle.master.inner,
      'TestFlag1',
      covenantScript,
      [
        { name: 'flag', type: 'bigint' },
        { name: 'masterInputIndex', type: 'bigint' },
      ],
      [1n, 0n],
      'p2sh32',
    );
    await expect(
      new TransactionBuilder({ provider })
        .addInput(atkCoin, attacker.unlockP2PKH())
        .addInput(realContainerUtxo, flag1Unlocker)
        .addOutput({ to: attacker.address, amount: realContainerUtxo.satoshis + atkCoin.satoshis - 500n })
        .send(),
    ).rejects.toThrow();

    // Also try forged NFT with SAME categoryId but 'mutable' capability (not minting) & wrong lock
    const sameCatMutableUtxo = await provider.addUtxo(
      attacker.address,
      randomUtxo({
        satoshis: 1000n,
        token: {
          category: metadata.categoryId,
          amount: 0n,
          nft: { capability: 'mutable', commitment: '' },
        },
      }),
    );
    await expect(
      new TransactionBuilder({ provider })
        .addInput(sameCatMutableUtxo, attacker.unlockP2PKH())
        .addInput(realContainerUtxo, flag1Unlocker)
        .addOutput({ to: attacker.address, amount: realContainerUtxo.satoshis })
        .send(),
    ).rejects.toThrow();
    expect(forgedContainerArtifact.contractName).toBe('ForgedContainerTest');

    // 5. Inbox adversarial attacks
    const depositAmount = 50_000n;
    const pCoin = (await payer.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(pCoin, payer.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: depositAmount })
      .addOutput({ to: payer.address, amount: pCoin.satoshis - depositAmount - 500n })
      .send();
    const inboxUtxo = (await provider.getUtxos(metadata.inboxAddress)).filter((u: any) => !u.token)[0];
    const mergeUnlocker = createSatoshiContainerMergeUnlocker(handle.master, metadata.categoryId, 0n);

    // 5a. Redirect output 0 away from satoshiContainerLock -> VM REVERT at input 0 (SatoshiContainer) / input 1 (Inbox)
    await expect(
      new TransactionBuilder({ provider })
        .addInput(realContainerUtxo, mergeUnlocker)
        .addInput(inboxUtxo, handle.inbox.unlock.sweepToContainer())
        .addOutput({ to: attacker.address, amount: realContainerUtxo.satoshis + inboxUtxo.satoshis - 900n })
        .send(),
    ).rejects.toThrow(/output 0 must be satoshi container|mandatory-script-verify-flag-failed.*input index [01]/);

    // 5b. Sponsored sweep (2 outputs) that skims 1 satoshi into attacker change -> VM REVERT at input 1 (WalletBalanceInbox)
    const atkCoin2 = (await attacker.getUtxos()).filter((u: any) => !u.token)[0];
    await expect(
      new TransactionBuilder({ provider })
        .addInput(realContainerUtxo, mergeUnlocker)
        .addInput(inboxUtxo, handle.inbox.unlock.sweepToContainer())
        .addInput(atkCoin2, attacker.unlockP2PKH())
        .addOutput({ to: metadata.satoshiContainerAddress, amount: realContainerUtxo.satoshis + inboxUtxo.satoshis - 1n })
        .addOutput({ to: attacker.address, amount: atkCoin2.satoshis + 1n - 1_500n })
        .send(),
    ).rejects.toThrow(/sponsored sweep must preserve protected balance|mandatory-script-verify-flag-failed.*input index 1/);

    // 5c. Self-sweep burning more than feeAllowance (400 + 1 * 600 = 1000) -> VM REVERT at input 1 (WalletBalanceInbox)
    await expect(
      new TransactionBuilder({ provider })
        .addInput(realContainerUtxo, mergeUnlocker)
        .addInput(inboxUtxo, handle.inbox.unlock.sweepToContainer())
        .addOutput({ to: metadata.satoshiContainerAddress, amount: realContainerUtxo.satoshis + inboxUtxo.satoshis - 1001n })
        .send(),
    ).rejects.toThrow(/self-sweep fee exceeds cap|mandatory-script-verify-flag-failed.*input index 1/);

    // 5d. Token-carrying junk UTXO at inboxAddress cannot be included in sweep, AND does not block sweeping legitimate BCH UTXO
    const tokenJunkAtInbox = await provider.addUtxo(
      metadata.inboxAddress,
      randomUtxo({
        satoshis: 1_500n,
        token: { category: 'bb'.repeat(32), amount: 5n },
      }),
    );
    await expect(
      new TransactionBuilder({ provider })
        .addInput(tokenJunkAtInbox, handle.inbox.unlock.sweepToContainer())
        .addOutput({ to: metadata.satoshiContainerAddress, amount: 700n })
        .send(),
    ).rejects.toThrow(/Implicit burning of fungible tokens/);
    await expect(
      new TransactionBuilder({ provider, allowImplicitFungibleTokenBurn: true })
        .addInput(tokenJunkAtInbox, handle.inbox.unlock.sweepToContainer())
        .addOutput({ to: metadata.satoshiContainerAddress, amount: 700n })
        .send(),
    ).rejects.toThrow(/inbox input cannot carry tokens|mandatory-script-verify-flag-failed.*input index 0/);

    // Legitimate BCH inboxUtxo STILL sweeps cleanly while tokenJunkAtInbox sits untouched at inboxAddress
    const safeSweepAlongsideJunk = await sweepInbox(handle, { mode: 'self' });
    expect(safeSweepAlongsideJunk.inboxSatsSwept).toBe(depositAmount);
    expect(safeSweepAlongsideJunk.usedDummyFunder).toBe(false);
    const postJunkInspect = await inspectWalletBalancePlan(handle);
    expect(postJunkInspect.inboxJunkTokenUtxos.length).toBe(1);
    expect(postJunkInspect.inboxBalance).toBe(0n);

    // 5e. Double container merge attempt (2 container UTXOs in same sweep) -> VM REVERT at input 2 (WalletBalanceInbox)
    const containerAfterSweep = postJunkInspect.containerUtxos[0];
    const extraContainerUtxo = await provider.addUtxo(
      metadata.satoshiContainerAddress,
      randomUtxo({ satoshis: 10_000n }),
    );
    const pCoinJunk2 = (await payer.getUtxos()).filter((u: any) => !u.token)[0];
    await new TransactionBuilder({ provider })
      .addInput(pCoinJunk2, payer.unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: 5_000n })
      .addOutput({ to: payer.address, amount: pCoinJunk2.satoshis - 5_000n - 500n })
      .send();
    const inboxUtxo2 = (await provider.getUtxos(metadata.inboxAddress)).filter((u: any) => !u.token)[0];
    await expect(
      new TransactionBuilder({ provider })
        .addInput(containerAfterSweep, mergeUnlocker)
        .addInput(extraContainerUtxo, mergeUnlocker)
        .addInput(inboxUtxo2, handle.inbox.unlock.sweepToContainer())
        .addOutput({
          to: metadata.satoshiContainerAddress,
          amount: containerAfterSweep.satoshis + extraContainerUtxo.satoshis + inboxUtxo2.satoshis - 1_500n,
        })
        .send(),
    ).rejects.toThrow(/at most one container input|mandatory-script-verify-flag-failed.*input index [012]/);
  });
});
