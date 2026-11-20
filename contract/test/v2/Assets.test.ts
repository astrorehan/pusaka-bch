import { describe, it, expect } from "vitest";
import {
  SignatureTemplate,
  Signer,
  TransactionBuilder,
  randomUtxo,
} from "@solidcash/solidcash";
import { MockNetworkProvider } from "@solidcash/solidcash/network/mock";
import {
  binToHex,
  hash160,
  secp256k1,
  encodeCashAddress,
  decodeTransactionBch,
  hexToBin,
  encodeTransaction,
  NonFungibleTokenCapability,
} from "@bitauth/libauth";
import {
  lockToCashAddress,
  buildCancelClaimTx,
  buildCheckInTx,
  buildGenesisV2PlanTx,
  buildOpenClaimByInactivityTx,
  buildFinalizeClaimTx,
  buildSendTx,
  buildUpdatePolicyTx,
  attachPusakaV2Plan,
  discoverPusakaV2State,
  encodeAnchorCommitment,
  encodePlanStateCommitment,
  finalizeBuilderTxHex,
  PLAN_STATUS_ACTIVE,
  PLAN_STATUS_PAID_OUT,
  PLAN_STATUS_REVIEW,
  type PlanStatusCode,
} from "../../../app/src/lib/protocol/pusaka-v2";
import { CURRENT_ASSET_REVISION, type AssetRevision } from "../../../app/src/lib/protocol/plan-metadata";
import {
  buildSwapTx,
  quoteBuy,
  poolScripts,
  tokenVault,
  buildTokenPayoutTx,
  buildTokenSendTx,
  tokenPayouts,
} from "../../../app/src/lib/protocol/assets";
import { StrictBip68ChainVerifier } from "../../scripts/v2/claim-review-verifier";

async function fixture(count = 3, protocolRevision: AssetRevision = CURRENT_ASSET_REVISION) {
  const provider = new MockNetworkProvider();
  const verifier = new StrictBip68ChainVerifier(provider);
  await verifier.init();
  const actor = (n: number) => {
    const key = new Uint8Array(32).fill(n),
      tpl = new SignatureTemplate(key);
    const pub = secp256k1.derivePublicKeyCompressed(key) as Uint8Array,
      pkh = hash160(pub);
    return {
      pkh,
      tpl,
      address: encodeCashAddress({
        prefix: "bchtest",
        type: "p2pkh",
        payload: pkh,
      }).address,
    };
  };
  const owner = actor(71),
    contacts = [actor(72), actor(73), actor(74)],
    heirs = Array.from({ length: count }, (_, i) => actor(80 + i)),
    sponsor = actor(100);
  async function fund(address: string, satoshis: bigint, token?: any) {
    const u = await provider.addUtxo(
      address,
      randomUtxo({ satoshis, vout: 0, ...(token ? { token } : {}) }),
    );
    await verifier.recordOutpoint(u.txid, u.vout, 1);
    return u;
  }
  const genesisCoin = await fund(owner.address, 800000n);
  const genesis = buildGenesisV2PlanTx({
    protocolRevision,
    provider,
    genesisUtxo: genesisCoin,
    ownerUnlocker: owner.tpl.unlockP2PKH(),
    ownerAddress: owner.address,
    ownerPkh: owner.pkh,
    policy: {
      inactivityPeriodSeconds: 600,
      reviewPeriodSeconds: 512,
      contacts: contacts.map((c) => c.pkh) as any,
      heirs: heirs.map((h) => ({ pkh: h.pkh, share: 1 })),
      feeBudget: 5000n,
    },
    createdAtLocktime: provider.getBlockTime() - 1,
    initialDepositSats: 500000n,
  });
  async function send(builder: TransactionBuilder) {
    return verifier.sendTxStrict(await finalizeBuilderTxHex(builder));
  }
  await send(genesis.builder);
  const handle = await attachPusakaV2Plan(
    JSON.parse(JSON.stringify(genesis.metadata)),
    provider,
  );
  const auth = await fund(owner.address, 600n),
    sponsorCoin = await fund(sponsor.address, 100000n);
  const scripts = poolScripts(binToHex(contacts[0].pkh));
  const poolAddress = lockToCashAddress(scripts.lock, "chipnet", true);
  const category = "ab".repeat(32);
  const poolCoin = await fund(poolAddress, 10000000n, {
    category,
    amount: 1000000n,
  });
  return {
    now: provider.getBlockTime(),
    provider,
    verifier,
    owner,
    contacts,
    heirs,
    sponsor,
    handle,
    auth,
    sponsorCoin,
    category,
    pool: {
      utxo: poolCoin,
      address: poolAddress,
      withdrawPkh: binToHex(contacts[0].pkh),
    },
    fund,
    send,
  };
}

describe("strict review anchor", () => {
  it("accepts cancellation only into the next ACTIVE round with cleared approvals", async () => {
    const f = await fixture();
    const { planCategoryHex, anchor, anchorAddress } = f.handle.contracts;
    const planSigner = f.contacts[0];
    const planUnlocker = planSigner.tpl.unlockP2PKH();
    const planAddress = lockToCashAddress(planUnlocker.generateLockingBytecode(), "chipnet", true);
    const commitment = (status: PlanStatusCode, round: number, approvalsMask = 0) => binToHex(encodePlanStateCommitment({
      status, round, approvalsMask, deadline: f.now + 600,
      inactivityPeriodSeconds: 600, policyHashBytes: f.handle.policy.policyHashBytes,
    }));
    const minting = { category: planCategoryHex, amount: 0n, nft: {
      capability: NonFungibleTokenCapability.minting, commitment: commitment(PLAN_STATUS_REVIEW, 7),
    } };
    // A test signer supplies the synthetic state input to verify the anchor independently.
    const plan = await f.fund(planAddress, 20_000n, minting);
    const marker = await f.fund(anchorAddress, 1_000n, { category: planCategoryHex, amount: 0n, nft: {
      capability: NonFungibleTokenCapability.none, commitment: binToHex(encodeAnchorCommitment(7, f.handle.policy.reviewSequence)),
    } });
    const check = async (successor: string) => f.verifier.verifyTxStrict(await finalizeBuilderTxHex(
      new TransactionBuilder({ provider: f.provider, allowImplicitNftBurn: true })
        .addInput(plan, planUnlocker)
        .addInput(marker, anchor.unlock.cancel())
        .addInput(f.auth, f.owner.tpl.unlockP2PKH())
        .addOutput({ to: planAddress, amount: 20_000n, token: { ...minting, nft: { ...minting.nft, commitment: successor } } }),
    ));

    expect(await check(commitment(PLAN_STATUS_ACTIVE, 8))).toMatchObject({ ok: true });
    for (const invalid of [
      commitment(PLAN_STATUS_PAID_OUT, 7),
      commitment(PLAN_STATUS_REVIEW, 8),
      commitment(PLAN_STATUS_ACTIVE, 7),
      commitment(PLAN_STATUS_ACTIVE, 8, 1),
    ]) {
      expect(await check(invalid)).toMatchObject({ ok: false, stage: "vm", error: expect.stringMatching(/input index 1/) });
    }
  });

  it("keeps owner cancellation available and applies the same review time to an owner-sponsored payout", async () => {
    const f = await fixture(10);
    const open = async () => {
      await f.verifier.advanceTimeAndMine(601, 6);
      const locktime = (await f.verifier.getCurrentSpendContext()).spendMtp - 1;
      const { planUtxo } = await discoverPusakaV2State(f.handle);
      await f.send(buildOpenClaimByInactivityTx({ handle: f.handle, planUtxo: planUtxo!, locktime }).builder);
      return discoverPusakaV2State(f.handle);
    };
    const review = await open();
    const common = {
      handle: f.handle, planUtxo: review.planUtxo!, anchorUtxo: review.anchorUtxo!,
      ownerUtxo: f.auth, ownerUnlocker: f.owner.tpl.unlockP2PKH(), ownerChangeAddress: f.owner.address,
      locktime: (await f.verifier.getCurrentSpendContext()).spendMtp - 1,
    };
    const cancel = buildCancelClaimTx(common);
    for (const { builder } of [
      cancel,
      buildSendTx({ ...common, recipientAddressOrLock: f.sponsor.address, amount: 1_000n }),
      buildCheckInTx(common),
      buildUpdatePolicyTx({ ...common, newPolicy: {
        inactivityPeriodSeconds: 900, reviewPeriodSeconds: 512, feeBudget: 5_000n,
        contacts: [f.contacts[0].pkh, f.contacts[1].pkh, f.contacts[2].pkh],
        heirs: f.heirs.map(({ pkh }) => ({ pkh, share: 1 })),
      } }),
    ]) {
      expect(await f.verifier.verifyTxStrict(await finalizeBuilderTxHex(builder))).toMatchObject({ ok: true });
    }
    await f.send(cancel.builder);
    expect(await discoverPusakaV2State(f.handle)).toMatchObject({ status: "ACTIVE", round: review.round + 1, approvalsMask: 0 });

    const reopened = await open();
    const planInputs = { handle: f.handle, planUtxo: reopened.planUtxo!, anchorUtxo: reopened.anchorUtxo! };
    const selfFunded = buildFinalizeClaimTx(planInputs);
    expect(selfFunded.fee).toBeLessThanOrEqual(f.handle.policy.feeBudget);
    const ownerCoin = await f.fund(f.owner.address, 10_000n);
    const payout = buildFinalizeClaimTx({ ...planInputs,
      sponsorUtxo: ownerCoin, sponsorUnlocker: f.owner.tpl.unlockP2PKH(), sponsorChangeAddress: f.owner.address,
    });
    const raw = await finalizeBuilderTxHex(payout.builder);
    expect(await f.verifier.verifyTxStrict(raw)).toMatchObject({ ok: false, stage: "bip68-sequence" });
    await f.verifier.advanceTimeAndMine(512, 6);
    await f.verifier.sendTxStrict(raw);
    expect(await discoverPusakaV2State(f.handle)).toMatchObject({ status: "PAID_OUT" });
    expect(payout.heirPayouts.map(({ address }) => address)).toEqual(f.heirs.map(({ address }) => address));
  }, 120000);

  it("restores the earlier revision and rejects relabeling it as a hardened plan", async () => {
    const f = await fixture(3, "assets-1");
    const restored = await attachPusakaV2Plan(f.handle.metadata, f.provider);
    expect(restored.metadata.protocolRevision).toBe("assets-1");
    await expect(attachPusakaV2Plan({ ...restored.metadata, protocolRevision: CURRENT_ASSET_REVISION }, f.provider))
      .rejects.toThrow(/derived PusakaV2Anchor/);
  });
});

describe("Cauldron swap and protected fungible inheritance", () => {
  it('spends part of a token receipt, renews life and preserves protected token change', async () => {
    const f=await fixture();
    const vault=tokenVault(f.handle),receipt=await f.fund(vault.address,5000n,{category:f.category,amount:100n});
    const before=await discoverPusakaV2State(f.handle);
    const sent=buildTokenSendTx({handle:f.handle,planUtxo:before.planUtxo!,tokenUtxo:receipt,ownerUtxo:f.auth,ownerUnlocker:f.owner.tpl.unlockP2PKH(),ownerAddress:f.owner.address,recipient:f.heirs[0].address,units:25n,locktime:f.now-1});
    await f.send(sent.builder);
    const after=await discoverPusakaV2State(f.handle);
    expect(after.round).toBe(before.round+1);
    expect((await f.provider.getUtxos(vault.address)).some(u=>u.token?.amount===75n)).toBe(true);
    expect((await f.provider.getUtxos(f.heirs[0].address)).some(u=>u.token?.amount===25n)).toBe(true);
    expect((await f.provider.getUtxos(f.owner.address)).some(u=>u.satoshis===600n)).toBe(true);
  });
  it("uses a real Cauldron V0 script, renews activity, protects return, enforces review and pays exact tokens", async () => {
    const f = await fixture();
    const state = await discoverPusakaV2State(f.handle);
    const quote = quoteBuy(f.pool, 50000n);
    const swap = buildSwapTx({
      handle: f.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: f.auth,
      ownerUnlocker: f.owner.tpl.unlockP2PKH(),
      ownerAddress: f.owner.address,
      quote,
      locktime: f.now - 1,
    });
    const swapResult = await f.send(swap.builder);
    const after = await discoverPusakaV2State(f.handle);
    expect(after.round).toBe(state.round + 1);
    expect(after.status).toBe("ACTIVE");
    expect(
      (await f.provider.getUtxos(f.owner.address)).some(
        (u) => u.satoshis === 600n,
      ),
    ).toBe(true);
    const vault = tokenVault(f.handle),
      received = (await f.provider.getUtxos(vault.address)).find(
        (u) => u.token?.category === f.category,
      )!;
    expect(received.token!.amount).toBe(quote.receive);
    expect(swapResult.txHex.length / 2).toBeLessThan(10000);
    // No early token payout, and no unrelated-plan proof.
    expect(() =>
      buildTokenPayoutTx({
        handle: f.handle,
        planUtxo: after.planUtxo!,
        tokenUtxo: received,
        sponsorUtxo: f.sponsorCoin,
        sponsorUnlocker: f.sponsor.tpl.unlockP2PKH(),
        sponsorAddress: f.sponsor.address,
      }),
    ).toThrow("Complete the BCH claim");
    await f.verifier.advanceTimeAndMine(601, 6);
    const now = (await f.verifier.getCurrentSpendContext()).spendMtp;
    await f.send(
      buildOpenClaimByInactivityTx({
        handle: f.handle,
        planUtxo: after.planUtxo!,
        locktime: now - 1,
      }).builder,
    );
    const review = await discoverPusakaV2State(f.handle);
    const final = buildFinalizeClaimTx({
      handle: f.handle,
      planUtxo: review.planUtxo!,
      anchorUtxo: review.anchorUtxo!,
    });
    expect((await f.verifier.verifyTxStrict(final.builder.build())).ok).toBe(
      false,
    );
    await f.verifier.advanceTimeAndMine(512, 6);
    await f.send(final.builder);
    const paid = await discoverPusakaV2State(f.handle);
    const payout = buildTokenPayoutTx({
      handle: f.handle,
      planUtxo: paid.planUtxo!,
      tokenUtxo: received,
      sponsorUtxo: f.sponsorCoin,
      sponsorUnlocker: f.sponsor.tpl.unlockP2PKH(),
      sponsorAddress: f.sponsor.address,
    });
    // Hijacked recipients and amount changes fail the actual VM.
    const raw = decodeTransactionBch(hexToBin(payout.builder.build()));
    if (typeof raw === "string") throw Error(raw);
    raw.outputs[1].lockingBytecode = poolScripts(f.pool.withdrawPkh).lock;
    expect(
      (await f.verifier.verifyTxStrict(binToHex(encodeTransaction(raw)))).ok,
    ).toBe(false);
    await f.send(payout.builder);
    const amounts = [];
    for (const heir of f.heirs)
      amounts.push(
        (await f.provider.getUtxos(heir.address))
          .filter((u) => u.token?.category === f.category)
          .reduce((s, u) => s + u.token!.amount, 0n),
      );
    expect(amounts).toEqual(payout.payouts.map((p) => p.units));
    expect(amounts.reduce((s, v) => s + v, 0n)).toBe(quote.receive);
    expect((await discoverPusakaV2State(f.handle)).status).toBe("PAID_OUT");
  }, 120000);

  it("follows updated heirs and handles ten heirs plus indivisible tiny receipts without losing tokens", async () => {
    const f = await fixture(10),
      state = await discoverPusakaV2State(f.handle);
    expect(tokenPayouts(f.handle, 7n).map((p) => p.units)).toEqual([
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      7n,
    ]);
    const updated = buildUpdatePolicyTx({
      handle: f.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: f.auth,
      ownerUnlocker: f.owner.tpl.unlockP2PKH(),
      ownerChangeAddress: f.owner.address,
      locktime: f.now - 1,
      newPolicy: {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        contacts: f.contacts.map((c) => c.pkh) as any,
        heirs: [...f.heirs].reverse().map((h) => ({ pkh: h.pkh, share: 1 })),
        feeBudget: 5000n,
      },
    });
    await f.send(updated.builder);
    const handle = await attachPusakaV2Plan(updated.nextMetadata, f.provider);
    expect(tokenVault(handle).address).toBe(tokenVault(f.handle).address);
    await expect(
      attachPusakaV2Plan(f.handle.metadata, f.provider),
    ).rejects.toThrow("policyHash mismatch");
    const receipt = await f.fund(tokenVault(handle).address, 800n, {
      category: f.category,
      amount: 7n,
    });
    await f.verifier.advanceTimeAndMine(601, 6);
    let current = await discoverPusakaV2State(handle);
    await f.send(
      buildOpenClaimByInactivityTx({
        handle,
        planUtxo: current.planUtxo!,
        locktime: (await f.verifier.getCurrentSpendContext()).spendMtp - 1,
      }).builder,
    );
    await f.verifier.advanceTimeAndMine(512, 6);
    current = await discoverPusakaV2State(handle);
    await f.send(
      buildFinalizeClaimTx({
        handle,
        planUtxo: current.planUtxo!,
        anchorUtxo: current.anchorUtxo!,
      }).builder,
    );
    current = await discoverPusakaV2State(handle);
    const result = buildTokenPayoutTx({
      handle,
      planUtxo: current.planUtxo!,
      tokenUtxo: receipt,
      sponsorUtxo: f.sponsorCoin,
      sponsorUnlocker: f.sponsor.tpl.unlockP2PKH(),
      sponsorAddress: f.sponsor.address,
    });
    await f.send(result.builder);
    expect(
      (await f.provider.getUtxos(f.heirs[0].address)).some(
        (u) => u.token?.amount === 7n,
      ),
    ).toBe(true);
  }, 120000);

  it("rejects expired quotes, fake pool scripts, zero minimum, wrong network metadata and old BCH-only plans", async () => {
    const f = await fixture();
    const state = await discoverPusakaV2State(f.handle);
    const quote = quoteBuy(f.pool, 50000n),
      args = {
        handle: f.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: f.auth,
        ownerUnlocker: f.owner.tpl.unlockP2PKH(),
        ownerAddress: f.owner.address,
        locktime: f.now - 1,
      };
    expect(() =>
      buildSwapTx({ ...args, quote: { ...quote, expiresAt: 0 } }),
    ).toThrow("expired");
    expect(() =>
      buildSwapTx({
        ...args,
        quote: { ...quote, minimum: quote.receive + 1n },
      }),
    ).toThrow("Minimum");
    expect(() =>
      quoteBuy({ ...f.pool, address: f.owner.address }, 50000n),
    ).toThrow("does not match");
    expect(() =>
      tokenVault({
        ...f.handle,
        metadata: { ...f.handle.metadata, protocolRevision: undefined },
      }),
    ).toThrow("BCH only");
    await expect(
      attachPusakaV2Plan(
        { ...f.handle.metadata, network: "mainnet" },
        f.provider,
      ),
    ).rejects.toThrow("network");
    // A public sweep cannot spend a token receipt using an owner path without a real signature.
    const v = tokenVault(f.handle),
      u = await f.fund(v.address, 800n, { category: f.category, amount: 10n });
    const theft = new TransactionBuilder({ provider: f.provider })
      .addInput(u, v.unlock.ownerSpend())
      .addOutput({
        to: lockToCashAddress(
          f.sponsor.tpl.unlockP2PKH().generateLockingBytecode(),
          "chipnet",
          true,
        ),
        amount: 546n,
        token: u.token,
      });
    expect((await f.verifier.verifyTxStrict(theft.build())).ok).toBe(false);
  }, 120000);
});
