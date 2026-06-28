import { BASE_URL, WEBSITE_ID } from './constants.js';

export function buildGuid(collectionId, itemId) {
  return `${WEBSITE_ID}:${collectionId}:${itemId}`;
}

export function indexGuids(xml) {
  const guids = new Set();
  for (const match of xml.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)) {
    guids.add(match[1].trim());
  }
  return guids;
}

export function countItems(xml) {
  return (xml.match(/<item>/g) || []).length;
}

export function formatPubDate(ms) {
  return new Date(ms).toUTCString().replace('GMT', '+0000');
}

export function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function stripHtml(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x26;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cdata(content) {
  const text = String(content);
  if (!text.includes(']]>')) {
    return `<![CDATA[${text}]]>`;
  }
  return `<![CDATA[${text.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function extractMp3Url(body) {
  const matches = [...String(body).matchAll(/https?:\/\/[^\s"<>]*\.mp3/gi)].map((m) => m[0]);
  return [...new Set(matches)][0] || null;
}

const PARAGRAPH_ATTRS = 'data-rte-preserve-empty="true" style="white-space:pre-wrap;"';

function emptyParagraph() {
  return `<p ${PARAGRAPH_ATTRS}></p>`;
}

function isEmptyParagraphHtml(paragraphHtml) {
  return /^<p\b[^>]*>\s*<\/p>$/i.test(paragraphHtml);
}

function wrapParagraph(innerHtml) {
  return `<p ${PARAGRAPH_ATTRS}>${innerHtml}</p>`;
}

function extractParagraphContents(html) {
  return [...String(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => match[1]);
}

function paragraphText(content) {
  return stripHtml(content).trim();
}

function needsSeparatorAfter(content) {
  const text = paragraphText(content);
  return (
    text === '~~~'
    || /sponsored by/i.test(text)
    || /Sponsorship opportunities/i.test(text)
    || text.startsWith('🟢')
  );
}

function needsSeparatorBefore(content) {
  const text = paragraphText(content);
  return (
    text === '~~~'
    || /Sponsorship opportunities/i.test(text)
    || text.startsWith('🟢')
    || text.startsWith('Follow Rabbi')
  );
}

function needsSeparatorBetween(prevContent, nextContent) {
  return needsSeparatorAfter(prevContent) || needsSeparatorBefore(nextContent);
}

function linkifyUrlsInContent(html) {
  return String(html).replace(/(https?:\/\/[^\s<"]+)/g, (url, _match, offset, whole) => {
    const before = whole.slice(0, offset);
    const lastOpen = before.lastIndexOf('<a ');
    const lastClose = before.lastIndexOf('</a>');
    if (lastOpen > lastClose) {
      return url;
    }
    const hrefPrefix = before.slice(-7);
    if (hrefPrefix === 'href="' || hrefPrefix === "href='") {
      return url;
    }
    return `<a href="${url}">${url}</a>`;
  });
}

export function formatDescriptionHtml(html) {
  const body = String(html || '').trim();
  if (!body || !body.includes('<p')) {
    return body;
  }

  const result = [];
  let prevNonEmpty = null;

  for (const rawContent of extractParagraphContents(body)) {
    const content = rawContent.trim();
    const isEmpty = !paragraphText(content);

    if (isEmpty) {
      if (result.length > 0 && isEmptyParagraphHtml(result[result.length - 1])) {
        continue;
      }
      result.push(emptyParagraph());
      prevNonEmpty = null;
      continue;
    }

    const formatted = linkifyUrlsInContent(content);

    if (
      prevNonEmpty
      && needsSeparatorBetween(prevNonEmpty, formatted)
      && (result.length === 0 || !isEmptyParagraphHtml(result[result.length - 1]))
    ) {
      result.push(emptyParagraph());
    }

    result.push(wrapParagraph(formatted));
    prevNonEmpty = formatted;
  }

  return result.join('');
}

export function extractDescriptionHtml(html) {
  const body = String(html || '').trim();
  if (!body) {
    return '';
  }

  const textBlocks = [];
  for (const match of body.matchAll(/<div class="sqs-html-content"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const content = match[1].trim();
    if (content) {
      textBlocks.push(content);
    }
  }

  let description = '';
  if (textBlocks.length > 0) {
    description = textBlocks.join('');
  } else if (!body.includes('sqs-layout')) {
    description = body;
  } else {
    description = stripHtml(body);
  }

  return formatDescriptionHtml(description);
}

export function parseByteLength(value) {
  if (value == null || value === '') {
    return null;
  }
  const cleaned = String(value).replace(/[^\d]/g, '');
  const bytes = Number(cleaned);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}

export function parseEnclosureLength(itemXml) {
  const match = itemXml.match(/<enclosure[^>]+length="([^"]+)"/);
  return match ? parseByteLength(match[1]) : null;
}

export function replaceItemDescription(itemXml, descriptionHtml) {
  return itemXml.replace(
    /<description>(?:<!\[CDATA\[[\s\S]*?\]\]>|[^<]*)<\/description>/,
    `<description>${cdata(descriptionHtml)}</description>`,
  );
}

export function ensureItunesDuration(itemXml, duration) {
  if (itemXml.includes('<itunes:duration>')) {
    return itemXml;
  }
  return itemXml.replace(
    '</itunes:explicit>',
    `</itunes:explicit><itunes:duration>${duration}</itunes:duration>`,
  );
}

export function ensureItunesEpisodeType(itemXml, episodeType = 'full') {
  if (itemXml.includes('<itunes:episodeType>')) {
    return itemXml;
  }
  return itemXml.replace(
    /(<itunes:title>[\s\S]*?<\/itunes:title>)/,
    `$1<itunes:episodeType>${episodeType}</itunes:episodeType>`,
  );
}

export function normalizeItemXml(itemXml) {
  let next = itemXml;
  const changes = { description: false, duration: false, episodeType: false };

  const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
  if (descMatch) {
    const clean = descMatch[1].includes('sqs-layout')
      ? extractDescriptionHtml(descMatch[1])
      : formatDescriptionHtml(descMatch[1]);
    if (clean && clean !== descMatch[1]) {
      next = replaceItemDescription(next, clean);
      changes.description = true;
    }
  }

  if (!next.includes('<itunes:duration>')) {
    const length = parseEnclosureLength(next);
    if (length) {
      next = ensureItunesDuration(next, formatDurationFromBytes(length));
      changes.duration = true;
    }
  }

  if (!next.includes('<itunes:episodeType>')) {
    next = ensureItunesEpisodeType(next);
    changes.episodeType = true;
  }

  return { itemXml: next, changes };
}

export function backblazeUrlForHead(mp3Url) {
  const blubrryMatch = mp3Url.match(/blubrry\.com\/rabbi_orlofsky_show\/(.+)/i);
  if (blubrryMatch) {
    const path = blubrryMatch[1];
    return path.startsWith('http') ? path : `https://${path}`;
  }
  return mp3Url;
}

export async function fetchContentLength(url, { retries = 3 } = {}) {
  const headUrl = backblazeUrlForHead(url);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(headUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`HEAD ${headUrl} returned ${response.status}`);
      }
      const length = response.headers.get('content-length');
      if (!length) {
        throw new Error(`HEAD ${headUrl} missing content-length`);
      }
      return length;
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`Unable to fetch content-length for ${url}`);
}

export function formatDurationFromBytes(lengthBytes) {
  const seconds = Math.round(Number(lengthBytes) / 16000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function imageHref(assetUrl) {
  if (!assetUrl) return '';
  return assetUrl.includes('?') ? assetUrl : `${assetUrl}?format=1500w`;
}

export function resolveItemLink(item) {
  const fullUrl = item.fullUrl;
  if (fullUrl) {
    if (fullUrl.startsWith('http')) {
      return fullUrl;
    }
    if (fullUrl.startsWith('/')) {
      return `${BASE_URL}${fullUrl}`;
    }
    return `${BASE_URL}/${fullUrl}`;
  }
  return `${BASE_URL}/podcast/${item.urlId}`;
}

export function buildItemXml(item, { mp3Url, length }) {
  const guid = buildGuid(item.collectionId, item.id);
  const link = resolveItemLink(item);
  const title = item.title;
  const creator = item.author?.displayName || item.author || 'Michoel Samuels';
  const pubDate = formatPubDate(item.publishOn);
  const rawBody = item.body || item.excerpt || '';
  const descriptionHtml = extractDescriptionHtml(rawBody);
  const summary = stripHtml(descriptionHtml || item.excerpt || title);
  const subtitle = summary.split('\n')[0] || title;
  const episode = /^\d+$/.test(String(item.urlId)) ? item.urlId : null;
  const image = imageHref(item.assetUrl);
  const duration = formatDurationFromBytes(length);
  const category = item.categories?.[0]?.name;

  const parts = [
    '<item>',
    `<title>${escapeXml(title)}</title>`,
  ];

  if (category) {
    parts.push(`<category>${escapeXml(category)}</category>`);
  }

  parts.push(
    `<dc:creator>${escapeXml(creator)}</dc:creator>`,
    `<pubDate>${pubDate}</pubDate>`,
    `<link>${escapeXml(link)}</link>`,
    `<guid isPermaLink="false">${guid}</guid>`,
    `<description>${cdata(descriptionHtml)}</description>`,
    `<itunes:author>Rabbi Dovid Orlofsky</itunes:author>`,
    `<itunes:subtitle>${escapeXml(subtitle)}</itunes:subtitle>`,
    `<itunes:summary>${escapeXml(summary)}</itunes:summary>`,
    '<itunes:explicit>false</itunes:explicit>',
    `<itunes:duration>${duration}</itunes:duration>`,
    `<itunes:image href="${escapeXml(image)}"/>`,
  );

  if (episode) {
    parts.push(`<itunes:episode>${escapeXml(episode)}</itunes:episode>`);
  }

  parts.push(
    `<itunes:title>${escapeXml(title)}</itunes:title>`,
    '<itunes:episodeType>full</itunes:episodeType>',
    `<enclosure url="${escapeXml(mp3Url.trim())}" length="${length}" type="audio/mpeg"/>`,
    `<media:content url="${escapeXml(mp3Url.trim())}" length="${length}" type="audio/mpeg" isDefault="true" medium="audio"><media:title type="plain">${escapeXml(title)}</media:title></media:content>`,
    '</item>',
  );

  return parts.join('');
}

export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractGuidFromItem(itemXml) {
  return (itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/) || [])[1]?.trim() || null;
}

export function findItemBoundsByGuid(xml, guid) {
  const guidIndex = xml.indexOf(`>${guid}</guid>`);
  if (guidIndex === -1) {
    throw new Error(`GUID not found: ${guid}`);
  }

  const itemStart = xml.lastIndexOf('<item>', guidIndex);
  if (itemStart === -1) {
    throw new Error(`Item start not found for GUID ${guid}`);
  }

  const nextItem = xml.indexOf('<item>', itemStart + 6);
  const chunkEnd = nextItem === -1 ? xml.indexOf('</channel>', itemStart) : nextItem;
  const chunk = xml.slice(itemStart, chunkEnd);
  const closeRel = chunk.lastIndexOf('</item>');
  if (closeRel === -1) {
    throw new Error(`Item end not found for GUID ${guid}`);
  }

  return { start: itemStart, end: itemStart + closeRel + '</item>'.length };
}

export function splitFeedItems(xml) {
  const firstItem = xml.indexOf('<item>');
  const lastChannel = xml.lastIndexOf('</channel>');
  if (firstItem === -1 || lastChannel === -1) {
    throw new Error('Invalid RSS: missing items or channel');
  }

  const items = [];
  let pos = firstItem;
  while (pos < lastChannel) {
    const start = xml.indexOf('<item>', pos);
    if (start === -1 || start >= lastChannel) {
      break;
    }
    const nextItem = xml.indexOf('<item>', start + 6);
    const chunkEnd = nextItem === -1 ? lastChannel : nextItem;
    const chunk = xml.slice(start, chunkEnd);
    const closeRel = chunk.lastIndexOf('</item>');
    if (closeRel === -1) {
      throw new Error('Invalid RSS: unclosed item');
    }
    items.push(xml.slice(start, start + closeRel + '</item>'.length));
    pos = start + closeRel + '</item>'.length;
  }

  return {
    head: xml.slice(0, firstItem),
    items,
    tail: xml.slice(lastChannel),
  };
}

export function prependItems(xml, itemXmlList) {
  const { head, items, tail } = splitFeedItems(xml);
  return `${head}${itemXmlList.join('')}${items.join('')}${tail}`;
}

export function replaceItemByGuid(xml, guid, newItemXml) {
  const { head, items, tail } = splitFeedItems(xml);
  let found = false;
  const nextItems = items.map((itemXml) => {
    if (extractGuidFromItem(itemXml) === guid) {
      found = true;
      return newItemXml;
    }
    return itemXml;
  });
  if (!found) {
    throw new Error(`Item not found for GUID ${guid}`);
  }
  return `${head}${nextItems.join('')}${tail}`;
}

export function removeItemByGuid(xml, guid) {
  const { start, end } = findItemBoundsByGuid(xml, guid);
  return `${xml.slice(0, start)}${xml.slice(end)}`;
}

export function appendItems(xml, itemXmlList) {
  const { head, items, tail } = splitFeedItems(xml);
  return `${head}${items.join('')}${itemXmlList.join('')}${tail}`;
}

export function updateLastBuildDate(xml, date = new Date()) {
  const value = formatPubDate(date.getTime());
  if (!xml.includes('<lastBuildDate>')) {
    throw new Error('Invalid RSS: missing <lastBuildDate>');
  }
  return xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, `<lastBuildDate>${value}</lastBuildDate>`);
}

export function ensureNewFeedUrl(xml, feedUrl) {
  const tag = `<itunes:new-feed-url>${feedUrl}</itunes:new-feed-url>`;
  if (xml.includes('<itunes:new-feed-url>')) {
    return xml.replace(/<itunes:new-feed-url>[^<]*<\/itunes:new-feed-url>/, tag);
  }
  if (!xml.includes('</itunes:owner>')) {
    throw new Error('Invalid RSS: missing </itunes:owner> for itunes:new-feed-url');
  }
  return xml.replace('</itunes:owner>', `</itunes:owner>${tag}`);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
