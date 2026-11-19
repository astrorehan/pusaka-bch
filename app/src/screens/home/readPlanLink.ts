// Finds and checks a plan link in pasted text or in a saved file, entirely in the browser.
import { decodePlan } from '../../lib/planLink';
import { MAX_PLAN_PAYLOAD } from '../../lib/planPayload';
import { decodePusakaV2PlanLink, encodePusakaV2PlanLink, readV2Metadata } from '../../lib/protocol/plan-metadata';
import type { NetworkName } from '../../lib/types';

export type PlanDestination = { pathname: '/plan' | '/v2/plan'; hash: string };
export type PlanLinkCheck = { ok: true; to: PlanDestination } | { ok: false; error: string };
export const MAX_PLAN_FILE_BYTES = 1_000_000;

const FRAGMENT = /\/plan\/?#([A-Za-z0-9_-]+)/;
const BARE_FRAGMENT = /^#?([A-Za-z0-9_-]{24,})$/;

const NETWORK_NAMES: Record<NetworkName, string> = { mainnet: 'the main network', chipnet: 'the test network' };

export function checkPlanLink(text: string, network: NetworkName, source: 'paste' | 'file' = 'paste'): PlanLinkCheck {
  if (text.length > MAX_PLAN_FILE_BYTES) return { ok: false, error: 'This saved plan is too large to open.' };
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: source === 'file' ? 'This file is empty.' : 'Paste a plan link first.' };
  }

  try {
    if (trimmed.startsWith('{')) {
      if (trimmed.length > MAX_PLAN_PAYLOAD) throw new Error('Plan data is too large');
      const plan = readV2Metadata(JSON.parse(trimmed));
      const hash = encodePusakaV2PlanLink(plan, '');
      if (hash.length > MAX_PLAN_PAYLOAD + 1) throw new Error('Plan data is too large');
      return destination('/v2/plan', hash, plan.network, network);
    }

    // Old downloads may wrap the link in HTML, plain text, or a shortcut.
    const fragment = trimmed.match(FRAGMENT)?.[1] ?? trimmed.match(BARE_FRAGMENT)?.[1];
    if (fragment) {
      const legacy = decodePlan(fragment);
      if (legacy) return destination('/plan', '#' + fragment, legacy.network, network);
      const plan = decodePusakaV2PlanLink(fragment);
      return destination('/v2/plan', '#' + fragment, plan.network, network);
    }
  } catch {
    // Both the file and paste paths use the same recovery instructions for invalid data.
  }

  return { ok: false, error: 'Could not read this plan. Paste the complete plan link or choose the saved plan file.' };
}

function destination(pathname: PlanDestination['pathname'], hash: string, planNetwork: string, network: NetworkName): PlanLinkCheck {
  if (planNetwork !== network) {
    const planName = planNetwork === 'mainnet' || planNetwork === 'chipnet' ? NETWORK_NAMES[planNetwork] : 'another network';
    return {
      ok: false,
      error: `This plan was made on ${planName}. This site uses ${NETWORK_NAMES[network]}.`,
    };
  }
  return { ok: true, to: { pathname, hash } };
}
