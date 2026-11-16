// Prints the test wallet's receive address at an index (same derivation as chain-e2e.ts).
import { deriveHdPath, deriveHdPrivateNodeFromSeed, deriveSeedFromBip39Mnemonic, secp256k1 } from '@bitauth/libauth';
import { addressOfPubkey } from '../src/lib/chain/network';
const root = deriveHdPrivateNodeFromSeed(deriveSeedFromBip39Mnemonic(process.env.SOLIDCASH_MNEMONIC_CHIPNET!), { throwErrors: true });
const node = deriveHdPath(root, `m/44'/145'/0'/0/${process.argv[2] ?? 0}`);
if (typeof node === 'string') throw new Error(node);
console.log(addressOfPubkey(secp256k1.derivePublicKeyCompressed(node.privateKey) as Uint8Array, 'chipnet'));
process.exit(0);
