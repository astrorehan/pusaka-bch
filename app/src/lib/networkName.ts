import type { NetworkName } from './types';

export const NETWORK: NetworkName = import.meta.env.VITE_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';
