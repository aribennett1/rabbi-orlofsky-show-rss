import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MERGE_FEEDS } from './lib/constants.js';
import {
  countItems,
  extractGuidFromItem,
  normalizeItemXml,
  splitFeedItems,
  updateLastBuildDate,
} from './lib/rss-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/normalize-feeds.js [--dry-run]');
      process.exit(0);
    }
  }
  return args;
}

async function normalizeFeed(feed, args) {
  const feedPath = path.join(ROOT, feed.feedFile);
  const xml = await fs.readFile(feedPath, 'utf8');
  const initialCount = countItems(xml);
  const { head, items, tail } = splitFeedItems(xml);

  const totals = { description: 0, duration: 0, episodeType: 0 };
  const nextItems = items.map((itemXml) => {
    const { itemXml: normalized, changes } = normalizeItemXml(itemXml);
    for (const key of Object.keys(totals)) {
      if (changes[key]) {
        totals[key]++;
        const title = (itemXml.match(/<title>([^<]*)<\/title>/) || [])[1] || extractGuidFromItem(itemXml);
        console.log(`  ${key}: ${title}`);
      }
    }
    return normalized;
  });

  const changed = Object.values(totals).some((count) => count > 0);
  if (!changed) {
    console.log('No changes needed.');
    return false;
  }

  console.log(
    `Summary: ${totals.description} description(s), ${totals.duration} duration(s), ${totals.episodeType} episode type(s)`,
  );

  if (args.dryRun) {
    console.log('Dry run complete. Feed not written.');
    return false;
  }

  let merged = `${head}${nextItems.join('')}${tail}`;
  merged = updateLastBuildDate(merged);
  await fs.writeFile(feedPath, merged, 'utf8');
  console.log(`Done. Items: ${initialCount} (unchanged count)`);
  return true;
}

async function main() {
  const args = parseArgs(process.argv);

  for (const feed of MERGE_FEEDS) {
    console.log(`\n=== ${feed.label} (${feed.feedFile}) ===`);
    await normalizeFeed(feed, args);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
