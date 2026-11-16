// Finds and checks a plan link in pasted text or in a saved file, entirely in the browser.
import { decodePlan } from '../../lib/planLink';
import type { NetworkName } from '../../lib/types';

export type PlanLinkCheck = { ok: true; fragment: string } | { ok: false; error: string };

const FRAGMENT = /\/plan\/?#([A-Za-z0-9_-]+)/;
const BARE_FRAGMENT = /^#?([A-Za-z0-9_-]{24,})$/;

const NETWORK_NAMES: Record<NetworkName, string> = { mainnet: 'the main network', chipnet: 'the test network' };

export function checkPlanLink(text: string, network: NetworkName, source: 'paste' | 'file' = 'paste'): PlanLinkCheck {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: source === 'file' ? 'This file is empty.' : 'Paste a plan link first.' };
  }

  // A saved file can be any text format (.txt, .html, .url); the link inside it is what counts.
  const fragment = trimmed.match(FRAGMENT)?.[1] ?? (source === 'paste' ? trimmed.match(BARE_FRAGMENT)?.[1] : undefined);

  if (!fragment) {
    return {
      ok: false,
      error:
        source === 'file'
          ? "This file doesn't contain a plan link. Choose the file you saved when the plan was made."
          : "This isn't a plan link. A plan link has /plan# in it, followed by a long code.",
    };
  }

  const plan = decodePlan(fragment);
  if (!plan) {
    return {
      ok: false,
      error:
        source === 'file'
          ? 'The plan link in this file is incomplete or was changed.'
          : 'This plan link is incomplete or was changed. Copy the whole link again, from start to end.',
    };
  }

  if (plan.network !== network) {
    return {
      ok: false,
      error: `This plan was made on ${NETWORK_NAMES[plan.network] ?? 'another network'}, but this site uses ${NETWORK_NAMES[network]}, so it can't open it.`,
    };
  }

  return { ok: true, fragment };
}
