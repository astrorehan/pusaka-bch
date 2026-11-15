import { defineConfig } from '@solidcash/solidhat/config';

export default defineConfig({
  paths: {
    contracts: 'contracts',
    artifacts: 'artifacts',
    tests: 'test',
  },
  compiler: { evmCompat: true },
  typegen: {
    targets: [{ target: 'ethers6', layout: 'typechain', outDir: 'typechain-types' }],
  },
  mnemonic: process.env.SOLIDCASH_MNEMONIC,
  accounts: { count: 1, satoshis: 100_000_000n },
  networks: {
    // Real BCH 2026 consensus limits and dust policy, so a green mock run means the transactions would be valid
    // on chain (the mock's defaults are relaxed: 1 MB inputs and commitments, no dust check).
    mock: {
      type: 'mock',
      consensus: {
        maximumInputBytes: 10_000,
        maximumStackItemBytes: 10_000,
        maximumTransactionBytes: 1_000_000,
        maximumNftCommitmentBytes: 128,
      },
      policy: { enforceDust: true },
    },
    regtest: {
      type: 'regtest',
      rpc: {
        url: process.env.REGTEST_RPC_URL ?? 'http://127.0.0.1:18443',
        user: process.env.REGTEST_RPC_USER ?? 'user',
        password: process.env.REGTEST_RPC_PASSWORD ?? 'password',
      },
    },
    chipnet: { type: 'electrum', network: 'chipnet', mnemonic: process.env.SOLIDCASH_MNEMONIC_CHIPNET },
    mainnet: { type: 'electrum', network: 'mainnet', mnemonic: process.env.SOLIDCASH_MNEMONIC_MAINNET },
  },
  defaultNetwork: 'mock',
});
