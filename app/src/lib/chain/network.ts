// Network access for the chain layer: one Electrum provider per app load, the network clock, address helpers.
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import {
  binToHex,
  cashAddressToLockingBytecode,
  decodeCashAddress,
  encodeCashAddress,
  hash160,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import type { NetworkName } from '../types';
import { addressPrefix } from '../cashAddress.ts';

let provider: ElectrumNetworkProvider | null = null;
let providerNetwork: NetworkName | null = null;
let freshProvider: ElectrumNetworkProvider | null = null;

// Public mainnet Electrum servers, in order of preference. If the first does not answer when the app starts
// reading, the next one is used, so one server's outage does not take the wallet or the demo down. Every
// server here must also be allowed in the page's connect-src policy (vite.config.ts).
export const MAINNET_SERVERS = ['bch.imaginary.cash', 'bch.loping.net', 'fulcrum.criptolayer.net', 'bch.soul-dev.com'];
let mainnetServer = MAINNET_SERVERS[0];
let chosen: Promise<void> | null = null;

/**
 * Whether an Electrum server serves the chain over a secure WebSocket within `ms`. It must answer a real chain
 * request (the current tip), not only a ping: a server can stay connected while its chain reads stall.
 */
function answers(host: string, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    let socket: WebSocket | undefined;
    const done = (ok: boolean) => {
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // already closed
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), ms);
    try {
      socket = new WebSocket(`wss://${host}:50004`);
    } catch {
      done(false);
      return;
    }
    socket.onopen = () =>
      socket?.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'blockchain.headers.subscribe', params: [] }));
    socket.onmessage = (event) => {
      try {
        const height = JSON.parse(String(event.data))?.result?.height;
        done(Number.isSafeInteger(height) && height > 0);
      } catch {
        done(false);
      }
    };
    socket.onerror = () => done(false);
    socket.onclose = () => done(false);
  });
}

/** Use the first mainnet server that answers. Readers await this once per page load before their first request. */
export function chooseServer(network: NetworkName): Promise<void> {
  if (network !== 'mainnet' || typeof WebSocket === 'undefined') return Promise.resolve();
  chosen ??= (async () => {
    // Start with the server in use, so a new choice after a failure tries the others before coming back to it.
    const start = MAINNET_SERVERS.indexOf(mainnetServer);
    const order = [...MAINNET_SERVERS.slice(start), ...MAINNET_SERVERS.slice(0, start)];
    for (const host of order) {
      if (!(await answers(host))) continue;
      if (host !== mainnetServer) {
        mainnetServer = host;
        provider = null;
        freshProvider = null;
      }
      return;
    }
  })();
  return chosen;
}

export class ServerTimeout extends Error {
  constructor() {
    super('The Bitcoin Cash network server did not answer in time.');
  }
}

/** Reject with ServerTimeout when `promise` has not settled within `ms`. */
export function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ServerTimeout()), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

let moving: { from: string; done: Promise<void> } | null = null;

/**
 * Leave `failed` for the next mainnet server that serves the chain. Many reads can fail together (the demo reads
 * every example at once): they share one move, and a read that failed on an older server never moves the app away
 * from the newer choice.
 */
function moveFrom(failed: string): Promise<void> {
  if (mainnetServer !== failed) return Promise.resolve();
  if (moving?.from === failed) return moving.done;
  const done = (async () => {
    const start = MAINNET_SERVERS.indexOf(failed);
    for (let step = 1; step < MAINNET_SERVERS.length; step++) {
      const host = MAINNET_SERVERS[(start + step) % MAINNET_SERVERS.length];
      if (!(await answers(host))) continue;
      if (mainnetServer === failed) {
        mainnetServer = host;
        provider = null;
        freshProvider = null;
        chosen = Promise.resolve();
      }
      return;
    }
  })().finally(() => {
    if (moving?.done === done) moving = null;
  });
  moving = { from: failed, done };
  return done;
}

/**
 * Run a network read, and when it fails because its server stopped serving the chain, move to the next server
 * that does and run it once more. A failure the server answered (a missing plan, a rejected transaction) is
 * returned as it is. `read` must ask getProvider / getFreshProvider for its provider on each call.
 */
export async function withFailover<T>(network: NetworkName, read: () => Promise<T>, ms = 25_000): Promise<T> {
  await chooseServer(network);
  if (network !== 'mainnet' || typeof WebSocket === 'undefined') return deadline(read(), ms);
  const host = mainnetServer;
  try {
    return await deadline(read(), ms);
  } catch (error) {
    if (mainnetServer === host) {
      // A request left waiting counts as a failure. Otherwise ask the server for the chain tip.
      if (!(error instanceof ServerTimeout) && (await answers(host))) throw error;
      await moveFrom(host);
      if (mainnetServer === host) throw error;
    }
    return deadline(read(), ms);
  }
}

export function getProvider(network: NetworkName): ElectrumNetworkProvider {
  if (!provider || providerNetwork !== network) {
    provider =
      network === 'mainnet'
        ? new ElectrumNetworkProvider(network, { hostname: mainnetServer })
        : new ElectrumNetworkProvider(network);
    providerNetwork = network;
  }
  return provider;
}

export function getFreshProvider(network: NetworkName): ElectrumNetworkProvider {
  if (!freshProvider || freshProvider.network !== network) {
    freshProvider =
      network === 'mainnet'
        ? new ElectrumNetworkProvider(network, { hostname: mainnetServer, listingCacheMilliseconds: 0 })
        : new ElectrumNetworkProvider(network, { listingCacheMilliseconds: 0 });
  }
  return freshProvider;
}

/** The 20-byte public key hash inside a P2PKH cashaddr; throws for anything else. */
export function pkhOfAddress(address: string): Uint8Array {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error(`Not a BCH address: ${decoded}`);
  if ((decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') || decoded.payload.length !== 20) {
    throw new Error('Only ordinary (P2PKH) BCH addresses can be heirs or owners.');
  }
  return decoded.payload;
}

export function lockOfAddress(address: string): Uint8Array {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === 'string') throw new Error(r);
  return r.bytecode;
}

/** Require an explicit network prefix before converting a destination to a script. */
export function paymentAddress(raw: string, network: NetworkName): string {
  const address = raw.trim();
  if (address.length > 80 || !address.includes(':')) throw new Error('Enter a complete BCH address with its network prefix.');
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error('Enter a valid BCH recipient address.');
  if (decoded.prefix !== addressPrefix(network)) throw new Error('Use a recipient address on this network.');
  return address.toLowerCase();
}

export function addressOfPubkey(publicKey: Uint8Array, network: NetworkName): string {
  return encodeCashAddress({ prefix: addressPrefix(network), type: 'p2pkh', payload: hash160(publicKey) }).address;
}

export function addressOfLock(lock: Uint8Array, network: NetworkName): string | null {
  const r = lockingBytecodeToCashAddress({ bytecode: lock, prefix: addressPrefix(network) });
  return typeof r === 'string' ? null : r.address;
}

/** Plain (token-free) satoshis at an address. */
export async function plainBalance(network: NetworkName, address: string): Promise<bigint> {
  const utxos = await getProvider(network).getUtxos(address);
  return utxos.filter((u) => !u.token).reduce((t, u) => t + u.satoshis, 0n);
}

/**
 * The network clock: median time past of the last 11 blocks. A timestamp locktime is final only below it,
 * so every time check in the contract is measured against this, not the wall clock (about an hour behind on Chipnet).
 */
export async function medianTimePast(network: NetworkName, atHeight?: number): Promise<bigint> {
  const provider = getProvider(network);
  const height = atHeight ?? Number(await provider.getBlockHeight());
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('The network returned an invalid block height.');
  const count = Math.min(height + 1, 11);
  const batch = await provider.performRequest('blockchain.block.headers', height - count + 1, count) as {
    count?: number;
    headers?: unknown[];
    hex?: string;
  };
  // Fulcrum 1.5 concatenates the headers. From 1.6 it returns a list.
  const headers = batch?.headers ?? (typeof batch?.hex === 'string' ? batch.hex.match(/.{1,160}/g) : null);
  if (batch?.count !== count || !Array.isArray(headers) || headers.length !== count) {
    throw new Error('The network returned an incomplete block header batch.');
  }
  const times = headers.map((hex) => {
    if (typeof hex !== 'string' || !/^[a-f\d]{160}$/i.test(hex)) {
      throw new Error('The network returned an invalid block header.');
    }
    const bytes = hexToBin(hex);
    return new DataView(bytes.buffer, bytes.byteOffset).getUint32(68, true);
  });
  times.sort((a, b) => a - b);
  return BigInt(times[Math.floor(times.length / 2)]);
}

export { addressPrefix, binToHex, hexToBin };
