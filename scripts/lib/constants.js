export const WEBSITE_ID = '587426f6e58c62badec24db0';
export const BASE_URL = 'https://www.rabbiorlofsky.com';
export const GITHUB_PAGES_BASE = 'https://aribennett1.github.io/rabbi-orlofsky-show-rss';
export const FEED_URL = `${GITHUB_PAGES_BASE}/rss-feed.xml`;
export const PARSHA_FEED_URL = `${GITHUB_PAGES_BASE}/parsha-in-5.xml`;
export const QA_FEED_URL = `${GITHUB_PAGES_BASE}/q-and-a.xml`;
export const USER_AGENT = 'rabbi-orlofsky-show-rss-backfill/1.0';
export const DEFAULT_DELAY_MS = 2000;

export const MERGE_FEEDS = [
  {
    label: 'The Rabbi Orlofsky Show',
    feedFile: 'rss-feed.xml',
    sourcePath: '/podcast',
    feedUrl: FEED_URL,
  },
  {
    label: 'Parasha in 5',
    feedFile: 'parsha-in-5.xml',
    sourcePath: '/parasha-in-5',
    feedUrl: PARSHA_FEED_URL,
  },
  {
    label: 'Q&A Podcast',
    feedFile: 'q-and-a.xml',
    sourcePath: '/qa-podcast',
    feedUrl: QA_FEED_URL,
  },
];
