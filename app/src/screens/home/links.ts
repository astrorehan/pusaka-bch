// Outbound links used by the home and How it works pages.
import { BANNER, DOCS_URL, REPO_URL, SOURCE_REF } from '../../components/banner-config';

export { DOCS_URL, REPO_URL };
/** The wallet's contracts: PusakaAssetPlan (the plan), PusakaV2Inbox, PusakaV2ReviewAnchor and PusakaTokenVault. */
export const CONTRACT_URL = `${REPO_URL}/tree/${SOURCE_REF}/contract/contracts`;
export const PLAN_CONTRACT_URL = `${REPO_URL}/blob/${SOURCE_REF}/contract/contracts/PusakaAssetPlan.scash`;
export const PROOF_URL = `${REPO_URL}/blob/${SOURCE_REF}/docs/proofs/v2-live.md`;
export const TESTS_URL = `${REPO_URL}/tree/${SOURCE_REF}/contract/test`;
export const DX_LOG_URL = `${REPO_URL}/blob/${SOURCE_REF}/docs/solidcash-dx-log.md`;
export const LICENSE_URL = `${REPO_URL}/blob/${SOURCE_REF}/LICENSE`;
export const BLAZE_START_URL = `${REPO_URL}/tree/blaze-start`;

/** Pusaka before BLAZE (Monad, Solidity). */
export const OLD_REPO_URL = 'https://github.com/astrorehan/pusaka';
export const OLD_DEMO_URL = 'https://pusaka-faraid.vercel.app';

export const SOLIDCASH_URL = 'https://solidcash.org';

/** Donations and prizes (CashTokens-aware address), the same one the banner shows. */
export const DONATION_ADDRESS = BANNER.cashTokensAddress;

/** Set once the demo video is published; the hero then shows "Watch the demo". */
export const DEMO_VIDEO_URL = '';
