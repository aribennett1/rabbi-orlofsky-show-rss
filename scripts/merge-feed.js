import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_URL, MERGE_FEEDS, USER_AGENT } from './lib/constants.js';
import {
  buildGuid,
  buildItemXml,
  countItems,
  ensureNewFeedUrl,
  extractMp3Url,
  fetchContentLength,
  indexGuids,
  prependItems,
  updateLastBuildDate,
} from './lib/rss-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/merge-feed.js [--dry-run]');
      process.exit(0);
    }
  }
  return args;
}

async function fetchRecentItems(sourcePath) {
  const recentPageUrl = `${BASE_URL}${sourcePath}?format=json-pretty`;
  const response = await fetch(recentPageUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`GET ${recentPageUrl} returned ${response.status}`);
  }
  const data = await response.json();
  return data.items || [];
}

async function buildItemFromJson(item) {
  const mp3Url = extractMp3Url(item.body);
  if (!mp3Url) {
    return null;
  }
  const length = await fetchContentLength(mp3Url);
  return buildItemXml(item, { mp3Url, length });
}

async function mergeFeed(feed, args) {
  const feedPath = path.join(ROOT, feed.feedFile);
  const xml = await fs.readFile(feedPath, 'utf8');
  const existingGuids = indexGuids(xml);
  const initialCount = countItems(xml);

  console.log(`Loaded ${feed.feedFile} (${initialCount} items)`);
  console.log(`Fetching recent episodes from ${feed.sourcePath}...`);

  const sourceItems = await fetchRecentItems(feed.sourcePath);
  console.log(`Fetched ${sourceItems.length} recent post(s)`);

  const toPrepend = [];
  let skipped = 0;

  for (const item of sourceItems) {
    const guid = buildGuid(item.collectionId, item.id);
    const label = item.urlId || item.title;
    const itemXml = await buildItemFromJson(item);

    if (!itemXml) {
      console.log(`Skipping ${label}: no MP3 URL in body`);
      skipped++;
      continue;
    }

    if (existingGuids.has(guid)) {
      console.log(`Up to date: ${label}`);
      continue;
    }

    toPrepend.push({ guid, xml: itemXml, label, publishOn: item.publishOn });
  }

  if (toPrepend.length === 0) {
    console.log(`No new episodes. Skipped ${skipped} post(s) without audio.`);
    return false;
  }

  toPrepend.sort((a, b) => a.publishOn - b.publishOn);

  let merged = xml;
  merged = prependItems(merged, toPrepend.map((entry) => entry.xml));
  for (const { label } of toPrepend) {
    console.log(`Added: ${label}`);
  }
  merged = updateLastBuildDate(merged);
  merged = ensureNewFeedUrl(merged, feed.feedUrl);

  if (args.dryRun) {
    console.log(`Dry run complete. Would add ${toPrepend.length}, skip ${skipped}.`);
    return false;
  }

  if (merged === xml) {
    console.log('Feed unchanged after merge.');
    return false;
  }

  await fs.writeFile(feedPath, merged, 'utf8');
  console.log(`Done. Items: ${initialCount} -> ${countItems(merged)}`);
  return true;
}

async function main() {
  const args = parseArgs(process.argv);

  for (const feed of MERGE_FEEDS) {
    console.log(`\n=== ${feed.label} ===`);
    await mergeFeed(feed, args);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
