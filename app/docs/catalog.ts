export const overview = {
  title: 'Introduction',
  group: 'Get started',
  summary: 'A Bitcoin Cash wallet with an inheritance plan built in. Learn to set up a plan and verify its transactions.',
};

export const sections = [
  {
    title: overview.group,
    pages: [
      { slug: 'wallet-guide', title: 'Wallet guide', source: 'docs/demo-guide.md', summary: 'Set up a wallet, manage your funds, and follow a family claim.' },
      { slug: 'judge-guide', title: 'Guide for judges', source: 'JUDGE.md', summary: 'Try the live demo and see what was built during BCH BLAZE.' },
    ],
  },
  {
    title: 'Architecture',
    pages: [
      { slug: 'inheritance-wallet', title: 'Inheritance wallet', source: 'docs/architecture/inheritance-wallet.md', summary: 'How the wallet protects funds, receives payments, and handles claims.' },
      { slug: 'plan-format', title: 'Plan format', source: 'docs/architecture/pusaka-v2-plan-format.md', summary: 'Plan links, policy commitments, and on-chain state.' },
    ],
  },
  {
    title: 'Verification',
    pages: [
      { slug: 'network-record', title: 'On-chain record', source: 'docs/proofs/v2-live.md', summary: 'Follow the Mainnet and Chipnet transactions through each stage of a plan.' },
      { slug: 'app-and-assets', title: 'App and assets', source: 'docs/proofs/app-and-assets.md', summary: 'Evidence for token receipts, swaps, and phone signing.' },
    ],
  },
  {
    title: 'SolidCash',
    pages: [
      { slug: 'solidcash-feedback', title: 'SolidCash feedback', source: 'docs/solidcash-feedback.md', summary: 'What worked and where the tooling could improve.' },
      { slug: 'solidcash-log', title: 'Developer log', source: 'docs/solidcash-dx-log.md', summary: 'The dated development record behind the feedback.' },
    ],
  },
];

export const pages = sections.flatMap(({ title, pages }) => pages.map((page) => ({ ...page, group: title })));
export type Page = (typeof pages)[number];

export type Heading = { id: string; text: string; level: 'h2' | 'h3' };
export type SearchEntry = { href: string; title: string; parent: string; text: string };

export const searchIndex = 'search-index.json';
