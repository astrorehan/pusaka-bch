// The bridge between a WizardConnect session and the SolidCash SDK's external signer.
//
// WizardConnect is an HD session: the wallet shares xpubs for its receive (child 0) and change (child 1) paths,
// and every sign request names, per input, which path and address index holds the key. The SDK hands us a
// `bch_signTransaction` request with the wallet's inputs left empty; we find each empty input's address among
// the wallet's derived addresses and send the request with those `inputPaths`.
import type { DappConnectionManager } from '@wizardconnect/dapp';
import type { ExternalTransactionSigner } from '@solidcash/solidcash';
import type { NetworkName } from '../types';
import { addressOfPubkey, binToHex, lockOfAddress } from './network';

/** How far into each HD path we look for the user's coins. Fresh wallets use the first few addresses. */
const SCAN_DEPTH = 20;
const PATHS: { child: number; name: 'receive' | 'change' }[] = [
  { child: 0, name: 'receive' },
  { child: 1, name: 'change' },
];

export interface DerivedAddress {
  address: string;
  lockHex: string;
  path: 'receive' | 'change';
  index: number;
}

/** Thrown when the user declines in their wallet: not an error, nothing was sent. */
export class WalletCancelledError extends Error {
  constructor() {
    super('Cancelled in your wallet. Nothing was sent.');
  }
}

export class WizardWallet {
  readonly manager: DappConnectionManager;
  readonly network: NetworkName;
  constructor(manager: DappConnectionManager, network: NetworkName) {
    this.manager = manager;
    this.network = network;
  }

  get name(): string {
    return this.manager.walletName ?? 'Your wallet';
  }

  /** The plan owner's address: the wallet's first receive address. */
  ownerAddress(): string {
    const pk = this.manager.getPubkey(0, 0n);
    if (!pk) throw new Error('The wallet has not shared its addresses yet. Reconnect your wallet.');
    return addressOfPubkey(pk, this.network);
  }

  ownerPublicKey(): Uint8Array | undefined {
    return this.manager.getPubkey(0, 0n);
  }

  /** Every address of the wallet we know how to sign for, receive first. */
  derivedAddresses(depth = SCAN_DEPTH): DerivedAddress[] {
    const out: DerivedAddress[] = [];
    for (const { child, name } of PATHS) {
      if (!this.manager.hasPath(child)) continue;
      for (let i = 0; i < depth; i++) {
        const pk = this.manager.getPubkey(child, BigInt(i));
        if (!pk) break;
        const address = addressOfPubkey(pk, this.network);
        out.push({ address, lockHex: binToHex(lockOfAddress(address)), path: name, index: i });
      }
    }
    return out;
  }

  /** The SDK-facing signer: signs whichever empty inputs belong to this wallet. */
  signer(userPrompt?: string): ExternalTransactionSigner {
    const byLock = new Map(this.derivedAddresses().map((d) => [d.lockHex, d]));
    return {
      signTransaction: async (request) => {
        const inputPaths: [number, string, number][] = [];
        request.transaction.inputs.forEach((input, i) => {
          if (input.unlockingBytecode.length !== 0) return;
          const known = byLock.get(binToHex(request.sourceOutputs[i].lockingBytecode));
          if (known) inputPaths.push([i, known.path, known.index]);
        });
        let response;
        try {
          response = await this.manager.signTransaction({
            transaction: { ...request, broadcast: false, userPrompt: userPrompt ?? request.userPrompt } as never,
            inputPaths,
          });
        } catch (e) {
          if (isCancel(e)) throw new WalletCancelledError();
          throw e;
        }
        if (response.error) {
          if (isCancel(response.error)) throw new WalletCancelledError();
          throw new Error(`Your wallet could not sign: ${response.error}`);
        }
        if (!response.signedTransaction) throw new WalletCancelledError();
        return { signedTransaction: response.signedTransaction };
      },
    };
  }
}

function isCancel(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String(e);
  return /reject|cancel|declin|denied|abort/i.test(text);
}
