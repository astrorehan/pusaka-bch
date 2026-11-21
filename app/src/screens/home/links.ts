// Outbound links used by the home and How it works pages.
import { BANNER, CODE_URL, DOCS_URL, REPO_URL, SOURCE_REF, TELEGRAM_HANDLE, TELEGRAM_URL } from '../../components/banner-config';

export { CODE_URL, DOCS_URL, REPO_URL, TELEGRAM_HANDLE, TELEGRAM_URL };
/** The wallet's contracts: PusakaAssetPlan (the plan), PusakaV2Inbox, PusakaV2ReviewAnchor and PusakaTokenVault. */
export const CONTRACT_URL = `${REPO_URL}/tree/${SOURCE_REF}/contract/contracts`;
export const PLAN_CONTRACT_URL = `${REPO_URL}/blob/${SOURCE_REF}/contract/contracts/PusakaAssetPlan.scash`;
export const PROOF_URL = `${DOCS_URL}network-record/`;
export const TESTS_URL = `${REPO_URL}/tree/${SOURCE_REF}/contract/test`;
export const DX_LOG_URL = `${DOCS_URL}solidcash-log/`;
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
