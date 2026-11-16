// The BCH BLAZE 2026 banner, required at the top of every page by the organiser:
// the presentation, the code and demo before and after the hackathon, and a CashTokens address
// (prizes, EMBER2026 community votes and the BLAZE Builder airdrop go to it).
//
// Leave a value as '' to hide its entry. A group with nothing left in it is hidden too.

export const REPO_URL = 'https://github.com/astrorehan/pusaka-bch';
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;

export const BANNER = {
  event: 'BCH BLAZE 2026',
  eventUrl: 'https://bchblaze.cash',

  /** The Widget Factory presentation (Google Slides "anyone with the link can view"). TODO: set before submitting. */
  slidesUrl: '',

  /** Pusaka as it was before the hackathon (Solidity on Monad). */
  before: {
    codeUrl: 'https://github.com/astrorehan/pusaka',
    demoUrl: 'https://pusaka-faraid.vercel.app',
  },

  /** What was built during BLAZE. `demoUrl` '/' means this app. */
  now: {
    codeUrl: REPO_URL,
    demoUrl: '/',
  },

  /**
   * A token-aware address you control (Paytaca shows it as bitcoincash:z…). TODO: set before submitting.
   * Note: screens/home/links.ts has DONATION_ADDRESS for the footer; keep the two the same.
   */
  cashTokensAddress: '',
};
