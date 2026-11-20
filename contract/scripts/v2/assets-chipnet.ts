// Chipnet-only proof. No mainnet keys or user sessions are used.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ethers, network } from "@solidcash/solidhat/hardhat3";
import { ElectrumNetworkProvider } from "@solidcash/solidcash/network/electrum";
import {
  SignatureTemplate,
  TransactionBuilder,
  Signer,
} from "@solidcash/solidcash";
import {
  binToHex,
  hexToBin,
  sha256,
  encodeTransaction,
  decodeTransactionBch,
} from "@bitauth/libauth";
import {
  buildGenesisV2PlanTx,
  buildContactApproveTx,
  buildFinalizeClaimTx,
  buildDistributeLateTx,
  buildSweepInboxTx,
  discoverPusakaV2State,
  attachPusakaV2Plan,
  ensureGenesisUtxo,
  lockToCashAddress,
  finalizeBuilderTxHex,
} from "../../../app/src/lib/protocol/pusaka-v2.ts";
import {
  poolScripts,
  quoteBuy,
  buildSwapTx,
  tokenVault,
  buildTokenPayoutTx,
} from "../../../app/src/lib/protocol/assets.ts";
import { CURRENT_ASSET_REVISION } from "../../../app/src/lib/protocol/plan-metadata.ts";
const file = `scripts/v2/.assets-chipnet-proof-${CURRENT_ASSET_REVISION}.json`;
const p = new ElectrumNetworkProvider("chipnet");
const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...args);
async function mtp(height?: number) {
  const h = height ?? Number(await p.getBlockHeight());
  const times = await Promise.all(
    Array.from({ length: 11 }, async (_, i) => {
      const b = hexToBin(
        String(await p.performRequest("blockchain.block.header", h - i)),
      );
      return new DataView(b.buffer, b.byteOffset).getUint32(68, true);
    }),
  );
  return times.sort((a, b) => a - b)[5];
}
async function main() {
  if (network.name !== "chipnet") throw Error("Chipnet only");
  const actors = (await ethers.getSigners(9)) as any[],
    [owner, , c0, c1, c2, h0, h1, h2] = actors;
  const tpl = (a: any) =>
    a.signatureTemplate ?? new SignatureTemplate(a.privateKey);
  // Exercise the external-signing request/apply path; this is a stand-in, not Paytaca approval.
  const external = Signer.external(
    {
      address: owner.address,
      publicKey: owner.publicKey,
      wallet: {
        async signTransaction(r: any) {
          const own = tpl(owner).unlockP2PKH();
          const lock = binToHex(own.generateLockingBytecode());
          const tx = {
            ...r.transaction,
            inputs: r.transaction.inputs.map((x: any, i: number) =>
              binToHex(r.sourceOutputs[i].lockingBytecode) === lock
                ? {
                    ...x,
                    unlockingBytecode: own.generateUnlockingBytecode({
                      transaction: r.transaction,
                      sourceOutputs: r.sourceOutputs,
                      inputIndex: i,
                    }),
                  }
                : x,
            ),
          };
          return { signedTransaction: binToHex(encodeTransaction(tx)) };
        },
      },
    },
    p,
  );
  async function coin(address: string, minimum = 600n) {
    for (let i = 0; i < 15; i++) {
      const coins = (await p.getUtxos(address))
        .filter((u) => !u.token && u.satoshis >= minimum)
        .sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1));
      if (coins[0]) return coins[0];
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw Error("Missing funded coin");
  }
  async function send(builder: TransactionBuilder) {
    const hex = await finalizeBuilderTxHex(builder);
    const response = await p.sendRawTransaction(hex);
    const txid =
      typeof response === "string" ? response : (response as any).txid;
    log("accepted", txid, "bytes", hex.length / 2);
    await new Promise((r) => setTimeout(r, 2500));
    return txid;
  }
  async function state(handle: any, txid?: string) {
    for (let i = 0; i < 20; i++) {
      const s = await discoverPusakaV2State(handle);
      if (s.planUtxo && (!txid || s.planUtxo.txid === txid)) return s;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw Error("State has not indexed");
  }
  let proof: any = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : null;
  if (process.env.PUSAKA_ASSETS_RESUME !== "1") {
    const balance = (await p.getUtxos(owner.address))
      .filter((u) => !u.token)
      .reduce((s, u) => s + u.satoshis, 0n);
    log("Read-only", owner.address, "plain sats", balance.toString());
    if (process.env.PUSAKA_ASSETS_BROADCAST !== "1") return;
    if (proof?.phase !== "complete" && proof)
      throw Error("Existing proof checkpoint; resume instead of overwriting");
    if (balance < 110000n) throw Error("Need 110,000 test sats");
    // Consolidate test coins at vout 0, then issue the test pair into the real Cauldron V0 covenant.
    const coins = (await p.getUtxos(owner.address)).filter((u) => !u.token);
    const consolidate = new TransactionBuilder({ provider: p });
    for (const u of coins) consolidate.addInput(u, tpl(owner).unlockP2PKH());
    consolidate.addOutput({ to: owner.address, amount: balance });
    const fee = BigInt(consolidate.getTransactionSize()) + 20n;
    if (balance - fee < 110_000n) throw Error("Need 110,000 test sats after consolidation fees");
    consolidate.outputs[0].amount = balance - fee;
    await send(consolidate);
    const gen = await ensureGenesisUtxo({
      provider: p,
      ownerAddress: owner.address,
      ownerUnlocker: tpl(owner).unlockP2PKH(),
      minimumSats: 100000n,
    });
    const category = gen.genesisUtxo.txid,
      withdrawPkh = binToHex(owner.pkh),
      scripts = poolScripts(withdrawPkh),
      poolAddress = lockToCashAddress(scripts.lock, "chipnet", true);
    const mint = new TransactionBuilder({ provider: p })
      .addInput(gen.genesisUtxo, tpl(owner).unlockP2PKH())
      .addOutput({
        to: poolAddress,
        amount: 20000n,
        token: { category, amount: 1000000n },
      })
      .addOutput({
        to: owner.address,
        amount: gen.genesisUtxo.satoshis - 21000n,
      });
    const mintTxid = await send(mint);
    const planGen = await ensureGenesisUtxo({
      provider: p,
      ownerAddress: owner.address,
      ownerUnlocker: external.unlockP2PKH(),
      minimumSats: 65000n,
    });
    const genesis = buildGenesisV2PlanTx({
      protocolRevision: CURRENT_ASSET_REVISION,
      provider: p,
      genesisUtxo: planGen.genesisUtxo,
      ownerUnlocker: external.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: {
        inactivityPeriodSeconds: 86400,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [h0, h1, h2].map((h: any) => ({ pkh: h.pkh, share: 1 })),
        feeBudget: 6000n,
      },
      createdAtLocktime: (await mtp()) - 1,
      initialDepositSats: 50000n,
    });
    const genesisTxid = await send(genesis.builder),
      handle = genesis.handle;
    proof = {
      network: "chipnet",
      pair: "BCH / Pusaka test FT",
      category,
      poolAddress,
      withdrawPkh,
      metadata: genesis.metadata,
      mintTxid,
      genesisTxid,
      phase: "created",
    };
    writeFileSync(file, JSON.stringify(proof, null, 2));
    let s = await state(handle, genesisTxid);
    const pool = (await p.getUtxos(poolAddress)).find(
      (u) => u.txid === mintTxid,
    )!;
    const quote = quoteBuy(
      { utxo: pool, address: poolAddress, withdrawPkh },
      5000n,
    );
    const swap = buildSwapTx({
      handle,
      planUtxo: s.planUtxo!,
      ownerUtxo: await coin(owner.address),
      ownerUnlocker: external.unlockP2PKH(),
      ownerAddress: owner.address,
      quote,
      locktime: (await mtp()) - 1,
    });
    proof.swapTxid = await send(swap.builder);
    proof.unitsReceived = quote.receive.toString();
    proof.tokenVaultAddress = tokenVault(handle).tokenAddress;
    proof.phase = "swapped";
    writeFileSync(file, JSON.stringify(proof, null, 2));
    s = await state(handle, proof.swapTxid);
    for (const [i, c] of [c0, c1].entries()) {
      const own = await coin(owner.address, 12000n);
      await send(
        new TransactionBuilder({ provider: p })
          .addInput(own, tpl(owner).unlockP2PKH())
          .addOutput({ to: c.address, amount: 8000n })
          .addOutput({ to: owner.address, amount: own.satoshis - 8500n }),
      );
      const approve = buildContactApproveTx({
        handle,
        planUtxo: s.planUtxo!,
        contactIndexOrAddress: i,
        contactUtxo: await coin(c.address, 7000n),
        contactUnlocker: tpl(c).unlockP2PKH(),
        contactChangeAddress: c.address,
      });
      proof[`contact${i}Txid`] = await send(approve.builder);
      s = await state(handle, proof[`contact${i}Txid`]);
      writeFileSync(file, JSON.stringify(proof, null, 2));
    }
    proof.phase = "review";
    writeFileSync(file, JSON.stringify(proof, null, 2));
    const early = buildFinalizeClaimTx({
      handle,
      planUtxo: s.planUtxo!,
      anchorUtxo: s.anchorUtxo!,
    });
    let rejected = false;
    try {
      await send(early.builder);
    } catch (e) {
      if (!String(e).includes("non-BIP68-final")) throw e;
      rejected = true;
      log("Early payout rejected: non-BIP68-final");
    }
    if (!rejected) throw Error("Early payout unexpectedly accepted");
    proof.earlyRejected = true;
    writeFileSync(file, JSON.stringify(proof, null, 2));
    return;
  }
  if (!proof) throw Error("No proof checkpoint");
  const handle = await attachPusakaV2Plan(proof.metadata, p);
  let s = await state(handle);
  if (s.status === "REVIEW") {
    const hash = binToHex(
      sha256.hash(handle.contracts.anchorLockingBytecode).reverse(),
    );
    for (;;) {
      const coins = (await p.performRequest(
        "blockchain.scripthash.listunspent",
        hash,
        "include_tokens",
      )) as any[];
      const anchor = coins.find(
        (c) =>
          c.tx_hash === s.anchorUtxo!.txid && c.tx_pos === s.anchorUtxo!.vout,
      );
      const tip = Number(await p.getBlockHeight()),
        age =
          anchor?.height > 0
            ? (await mtp(tip)) - (await mtp(anchor.height - 1))
            : 0;
      log("Anchor maturity", {
        tip,
        height: anchor?.height,
        age,
        required: 512,
      });
      if (anchor?.height > 0 && age >= 512) {
        proof.maturity = { tip, anchorHeight: anchor.height, age };
        break;
      }
      if (process.env.PUSAKA_ASSETS_WAIT !== "1") return;
      await new Promise((r) => setTimeout(r, 30000));
    }
    const finalize = buildFinalizeClaimTx({
      handle,
      planUtxo: s.planUtxo!,
      anchorUtxo: s.anchorUtxo!,
    });
    proof.finalizeTxid = await send(finalize.builder);
    proof.phase = "bch-paid";
    writeFileSync(file, JSON.stringify(proof, null, 2));
    s = await state(handle, proof.finalizeTxid);
  }
  if (s.status === "PAID_OUT" && proof.phase !== "complete") {
    const vault = tokenVault(handle),
      token = (await p.getUtxos(vault.address)).find(
        (u) => u.token?.category === proof.category,
      );
    if (!token) throw Error("Protected token receipt missing");
    const payout = buildTokenPayoutTx({
      handle,
      planUtxo: s.planUtxo!,
      tokenUtxo: token,
      sponsorUtxo: await coin(owner.address, 10000n),
      sponsorUnlocker: external.unlockP2PKH(),
      sponsorAddress: owner.address,
    });
    proof.tokenPayoutTxid = await send(payout.builder);
    const tx = decodeTransactionBch(
      hexToBin(await p.getRawTransaction(proof.tokenPayoutTxid)),
    );
    if (typeof tx === "string") throw Error(tx);
    proof.payouts = payout.payouts.map((x, i) => {
      if (tx.outputs[i + 1].token?.amount !== x.units)
        throw Error("Token output mismatch");
      return { ...x, units: x.units.toString() };
    });
    proof.phase = "complete";
    writeFileSync(file, JSON.stringify(proof, null, 2));
    log("COMPLETE", proof.tokenPayoutTxid);
  }
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
