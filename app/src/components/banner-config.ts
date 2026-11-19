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

  /** The presentation in the organiser's template, as a PDF in the repository. A public Google Slides link works too. */
  slidesUrl: `${REPO_URL}/blob/main/docs/Pusaka-BCH-BLAZE-2026.pdf`,

  /** Pusaka as it was before the hackathon (Solidity on Monad). */
  before: {
    codeUrl: 'https://github.com/astrorehan/pusaka',
    demoUrl: 'https://pusaka-faraid.vercel.app',
  },

  /** What was built during BLAZE. A `demoUrl` starting with '/' is a page of this app: the live example plans. */
  now: {
    codeUrl: REPO_URL,
    demoUrl: '/wallet/demo',
  },

  /**
   * A token-aware address you control (Paytaca shows it as bitcoincash:z…): prizes, EMBER2026 votes and the
   * BLAZE Builder airdrop. The one listed as the donation and prize address in the project notes; the home
   * footer reads it from here (screens/home/links.ts), so the two can't drift apart.
   */
  cashTokensAddress: 'bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux',
};
