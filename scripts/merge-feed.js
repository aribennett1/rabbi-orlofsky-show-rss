import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_URL, USER_AGENT } from './lib/constants.js';
import {
  buildGuid,
  buildItemXml,
  countItems,
  extractMp3Url,
  fetchContentLength,
  indexGuids,
  prependItems,
  updateLastBuildDate,
} from './lib/rss-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FEED_PATH = path.join(ROOT, 'rss-feed.xml');
const RECENT_PAGE_URL = `${BASE_URL}/podcast?format=json-pretty`;

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

async function fetchRecentItems() {
  const response = await fetch(RECENT_PAGE_URL, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`GET ${RECENT_PAGE_URL} returned ${response.status}`);
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

async function main() {
  const args = parseArgs(process.argv);
  const xml = await fs.readFile(FEED_PATH, 'utf8');
  const existingGuids = indexGuids(xml);
  const initialCount = countItems(xml);

  console.log(`Loaded ${FEED_PATH} (${initialCount} items)`);
  console.log(`Fetching recent episodes from Squarespace JSON...`);

  const sourceItems = await fetchRecentItems();
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
    return;
  }

  toPrepend.sort((a, b) => a.publishOn - b.publishOn);

  let merged = xml;
  merged = prependItems(merged, toPrepend.map((entry) => entry.xml));
  for (const { label } of toPrepend) {
    console.log(`Added: ${label}`);
  }
  merged = updateLastBuildDate(merged);

  if (args.dryRun) {
    console.log(`Dry run complete. Would add ${toPrepend.length}, skip ${skipped}.`);
    return;
  }

  if (merged === xml) {
    console.log('Feed unchanged after merge.');
    return;
  }

  await fs.writeFile(FEED_PATH, merged, 'utf8');
  console.log(`Done. Items: ${initialCount} -> ${countItems(merged)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
