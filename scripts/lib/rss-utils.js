import { WEBSITE_ID } from './constants.js';

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

export function buildItemXml(item, { mp3Url, length }) {
  const guid = buildGuid(item.collectionId, item.id);
  const link = item.fullUrl || `https://www.rabbiorlofsky.com/podcast/${item.urlId}`;
  const title = item.title;
  const creator = item.author?.displayName || item.author || 'Michoel Samuels';
  const pubDate = formatPubDate(item.publishOn);
  const descriptionHtml = item.body || item.excerpt || '';
  const summary = stripHtml(item.excerpt || item.body || title);
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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
