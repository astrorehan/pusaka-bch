import { describe, it, expect } from 'vitest';
import { ethers } from '@solidcash/solidhat/hardhat3';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const DAY = 86400n;
const PERIOD = 30n * DAY;
const FEE = 2000n;
const TOTAL = 120n;
// Faraid case: wife 15, father 20, mother 20, two sons 26 each, daughter 13 (out of 120)
const FARAID = [15n, 20n, 20n, 26n, 26n, 13n];

async function setup(shares: bigint[] = FARAID, balance = 1_000_000n) {
  const signers = await ethers.getSigners(shares.length + 2);
  const [owner, stranger, ...heirs] = signers;
  const now = BigInt(await time.latest());
  const total = shares.reduce((a, b) => a + b, 0n);
  const Pusaka = await ethers.getContractFactory('Pusaka', owner);
  const c = await Pusaka.deploy(owner.pkh, PERIOD, total, FEE, now + PERIOD,
    heirs.map((h: any, i: number) => ({ pkh: h.pkh, share: shares[i] })),
    { initialBalance: balance });
  await c.waitForDeployment();
  return { owner, stranger, heirs, c, now, total, balance };
}
// A time locktime is final only below the median time past.
const lockTime = async () => Number(BigInt(await time.latest()) - 1n);

function payout(call: any, heirs: any[], shares: bigint[], pot: bigint, total: bigint) {
  return heirs.reduce((b, h, i) => b.transfer(h.getLockingBytecode(), (pot * shares[i]) / total), call);
}

describe('Pusaka (stateful)', { timeout: 120_000 }, () => {
  it('deploys with heirs, deadline and balance in state', async () => {
    const { c, now } = await setup();
    expect(await c.state.deadline()).toBe(now + PERIOD);
    expect((await c.getState()).heirs.length).toBe(6);
    expect(await c.getBalance()).toBe(1_000_000n);
  });

  it('owner check-in moves the deadline forward and emits CheckedIn', async () => {
    const { c, owner } = await setup();
    await time.increase(10n * DAY);
    const t = await lockTime();
    const r = await c.connect(owner).call.checkIn().setLocktime(t).send();
    expect(await c.state.deadline()).toBe(BigInt(t) + PERIOD);
    expect(r.events[0].event).toBe('CheckedIn');
  });

  it('a stranger cannot check in', async () => {
    const { c, stranger } = await setup();
    await expect(c.connect(stranger).call.checkIn().setLocktime(await lockTime())).toBeRevertedWith(/owner coin/);
  });

  it('nobody can distribute before the deadline', async () => {
    const { c, stranger, heirs, total, balance } = await setup();
    await time.increase(PERIOD - DAY);
    const call = c.connect(stranger).call.distribute().setLocktime(await lockTime());
    await expect(payout(call, heirs, FARAID, balance - FEE, total)).toBeRevertedWith(/./);
  });

  it('a check-in after 29 days keeps the heirs waiting another full period', async () => {
    const { c, owner, stranger, heirs, total, balance } = await setup();
    await time.increase(PERIOD - DAY);
    await c.connect(owner).call.checkIn().setLocktime(await lockTime()).send();
    await time.increase(2n * DAY); // past the first deadline, inside the new one
    const call = c.connect(stranger).call.distribute().setLocktime(await lockTime());
    await expect(payout(call, heirs, FARAID, balance - FEE, total)).toBeRevertedWith(/./);
  });

  it('after the deadline anyone pays all 6 faraid heirs in one transaction', async () => {
    const { c, stranger, heirs, total, balance } = await setup();
    await time.increase(PERIOD + 10n);
    const pot = balance - FEE;
    const before = await Promise.all(heirs.map((h: any) => ethers.provider.getBalance(h.address)));
    const call = c.connect(stranger).call.distribute().setLocktime(await lockTime());
    const r = await payout(call, heirs, FARAID, pot, total).send();
    expect(r.events.map((e: any) => e.event)).toContain('Distributed');
    const after = await Promise.all(heirs.map((h: any) => ethers.provider.getBalance(h.address)));
    heirs.forEach((_: any, i: number) => expect(after[i] - before[i]).toBe((pot * FARAID[i]) / total));
  });

  it('rejects a payout that moves 1 satoshi from the daughter to the wife', async () => {
    const { c, stranger, heirs, total, balance } = await setup();
    await time.increase(PERIOD + 10n);
    const pot = balance - FEE;
    const amounts = FARAID.map((s) => (pot * s) / total);
    amounts[5] -= 1n;
    amounts[0] += 1n;
    const call = heirs.reduce((b: any, h: any, i: number) => b.transfer(h.getLockingBytecode(), amounts[i]),
      c.connect(stranger).call.distribute().setLocktime(await lockTime()));
    await expect(call).toBeRevertedWith(/./);
  });

  it('rejects a payout to a stranger instead of an heir', async () => {
    const { c, stranger, heirs, total, balance } = await setup();
    await time.increase(PERIOD + 10n);
    const swapped = [...heirs];
    swapped[3] = stranger;
    const call = c.connect(stranger).call.distribute().setLocktime(await lockTime());
    await expect(payout(call, swapped, FARAID, balance - FEE, total)).toBeRevertedWith(/./);
  });

  it('pays 10 heirs (the maximum) in one transaction', async () => {
    const shares = Array.from({ length: 10 }, (_, i) => BigInt(i + 1));
    const { c, stranger, heirs, total, balance } = await setup(shares, 5_000_000n);
    await time.increase(PERIOD + 10n);
    const call = c.connect(stranger).call.distribute().setLocktime(await lockTime());
    const r = await payout(call, heirs, shares, balance - FEE, total).send();
    expect(r.events.map((e: any) => e.event)).toContain('Distributed');
  });

  it('refuses a vault with 11 heirs', async () => {
    const shares = Array.from({ length: 11 }, () => 1n);
    await expect(setup(shares)).rejects.toThrow();
  });

  it('only the owner can withdraw, and withdraw empties the vault', async () => {
    const { c, owner, stranger } = await setup();
    await expect(c.connect(stranger).call.withdraw()).toBeRevertedWith(/owner coin/);
    await c.connect(owner).call.withdraw().send();
    expect(await c.getBalance()).toBe(0n);
  });
});
