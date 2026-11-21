// The BCH BLAZE 2026 banner, required at the top of every page by the organiser:
// the presentation, the code and demo before and after the hackathon, and a CashTokens address
// (prizes, EMBER2026 community votes and the BLAZE Builder airdrop go to it).
//
// Leave a value as '' to hide its entry. A group with nothing left in it is hidden too.

export const REPO_URL = 'https://github.com/astrorehan/pusaka-bch';
/** The branch judges read: the BLAZE release, until it is merged into main. */
export const SOURCE_REF = import.meta.env.VITE_RELEASE_REF || 'release/v2-readiness';
const sourceRef = SOURCE_REF;
export const DOCS_URL = `${REPO_URL}/tree/${sourceRef}/docs`;
/** The code judges should read: the repository at the release branch. */
export const CODE_URL = `${REPO_URL}/tree/${sourceRef}`;

export const BANNER = {
  event: 'BCH BLAZE 2026',
  eventUrl: 'https://bchblaze.cash',

  /** The presentation in the organiser's template, as a PDF in the repository. A public Google Slides link works too. */
  slidesUrl: 'https://docs.google.com/presentation/d/1xBfLkjmP-jgbWSFdYGgpf9XMxtuWoqXeuoXi-L64PpE/edit?usp=sharing',

  /** Pusaka as it was before the hackathon (Solidity on Monad). */
  before: {
    codeUrl: 'https://github.com/astrorehan/pusaka',
    demoUrl: 'https://pusaka-faraid.vercel.app',
  },

  /** What was built during BLAZE. A `demoUrl` starting with '/' is a page of this app: the live example plans. */
  now: {
    codeUrl: `${REPO_URL}/tree/${sourceRef}`,
    demoUrl: '/wallet/demo',
  },

  /**
   * A token-aware address you control (Paytaca shows it as bitcoincash:z…): prizes, EMBER2026 votes and the
   * BLAZE Builder airdrop. The one listed as the donation and prize address in the project notes; the home
   * footer reads it from here (screens/home/links.ts), so the two can't drift apart.
   */
  cashTokensAddress: 'bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux',
};
