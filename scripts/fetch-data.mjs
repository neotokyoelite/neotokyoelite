// Finds NeoTokyo Citizens NFTs that are BOTH:
//   1. "Elite" (rarityMonRank < RARITY_THRESHOLD), per neotokyo.codes
//   2. Currently listed for sale on OpenSea
// and writes the merged result to site/data.json for the static site to render.

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const RARITY_THRESHOLD = 500;
const COLLECTION_SLUG = 'neotokyo-citizens';
const CONTRACT_ADDRESS = '0xB9951B43802dCF3ef5b14567cb17adF367ed1c0F';
const IMAGE_BASE = 'https://neo-tokyo.nyc3.cdn.digitaloceanspaces.com/s1Citizen/pngs';

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
if (!OPENSEA_API_KEY) {
  console.error('Missing OPENSEA_API_KEY environment variable.');
  process.exit(1);
}

const FILTER_URL = `https://neotokyo.codes/citizens?filters=${encodeURIComponent(
  JSON.stringify({ rarityMonRank: { lt: RARITY_THRESHOLD } })
)}`;

// --- Step 1: get every "Elite" citizen's rarity rank from neotokyo.codes ---
// This drives a real browser through the same filtered page + pagination the
// user was clicking through by hand, and reads the data straight off the
// network responses instead of scraping the DOM.
async function getEliteRanks() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const ranks = new Map(); // tokenId (string) -> rarityMonRank (number)

  const captureFromResponse = async (response) => {
    if (!response.url().includes('/api/rpc/getCitizens') || response.status() !== 200) return;
    let data;
    try {
      data = await response.json();
    } catch {
      return;
    }
    const list = data?.result?.citizens ?? [];
    for (const c of list) {
      if (typeof c.rarityMonRank === 'number' && c.rarityMonRank < RARITY_THRESHOLD) {
        ranks.set(String(c.tokenId), c.rarityMonRank);
      }
    }
  };

  page.on('response', captureFromResponse);

  const firstResponse = page.waitForResponse(
    (r) => r.url().includes('/api/rpc/getCitizens') && r.status() === 200,
    { timeout: 30000 }
  );
  await page.goto(FILTER_URL, { waitUntil: 'domcontentloaded' });
  await firstResponse;

  // Click through pagination ("Go to next page") until it's disabled or we
  // stop discovering new token ids. Capped as a safety net against an
  // unexpected infinite loop if the site's markup changes.
  for (let i = 0; i < 30; i++) {
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    const count = await nextButton.count();
    if (count === 0) break;
    const disabled = await nextButton.first().isDisabled().catch(() => true);
    if (disabled) break;

    const sizeBefore = ranks.size;
    const nextResponse = page.waitForResponse(
      (r) => r.url().includes('/api/rpc/getCitizens') && r.status() === 200,
      { timeout: 30000 }
    );
    await nextButton.first().click();
    await nextResponse;
    if (ranks.size === sizeBefore) break; // no new data came in, stop
  }

  await browser.close();
  return ranks;
}

// --- Step 2: get current active OpenSea listings for the collection ---
async function getActiveListings() {
  const listings = [];
  let cursor = null;

  do {
    const url = new URL(`https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/all`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('next', cursor);

    const res = await fetch(url, {
      headers: { 'x-api-key': OPENSEA_API_KEY, accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`OpenSea API error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    for (const listing of data.listings ?? []) {
      const offerItem = listing?.protocol_data?.parameters?.offer?.[0];
      if (!offerItem) continue;

      const tokenId = String(offerItem.identifierOrCriteria);

      // Prefer the top-level aggregate price OpenSea reports; fall back to
      // summing the consideration items (seller proceeds + fees) if that's
      // ever missing, since the underlying order is a standard Seaport order.
      const current = listing?.price?.current;
      let value, decimals, currency;
      if (current?.value != null) {
        value = BigInt(current.value);
        decimals = current.decimals ?? 18;
        currency = current.currency ?? 'ETH';
      } else {
        const considerationItems = listing?.protocol_data?.parameters?.consideration ?? [];
        value = considerationItems.reduce((sum, item) => sum + BigInt(item.startAmount ?? '0'), 0n);
        decimals = 18;
        currency = 'ETH';
      }

      listings.push({
        tokenId,
        price: Number(value) / 10 ** decimals,
        currency,
        openseaUrl: `https://opensea.io/assets/ethereum/${CONTRACT_ADDRESS}/${tokenId}`,
      });
    }
    cursor = data.next || null;
  } while (cursor);

  return listings;
}

async function main() {
  console.log('Fetching Elite rarity ranks from neotokyo.codes...');
  const eliteRanks = await getEliteRanks();
  console.log(`Found ${eliteRanks.size} Elite citizens (rarity < ${RARITY_THRESHOLD}).`);

  console.log('Fetching active OpenSea listings...');
  const listings = await getActiveListings();
  console.log(`Found ${listings.length} active listings total.`);

  const matches = listings
    .filter((l) => eliteRanks.has(l.tokenId))
    .map((l) => ({
      ...l,
      rarityRank: eliteRanks.get(l.tokenId),
      image: `${IMAGE_BASE}/${l.tokenId}.png`,
    }))
    .sort((a, b) => a.price - b.price);

  console.log(`${matches.length} Elite citizens are currently for sale.`);

  const output = {
    generatedAt: new Date().toISOString(),
    rarityThreshold: RARITY_THRESHOLD,
    collectionSlug: COLLECTION_SLUG,
    count: matches.length,
    citizens: matches,
  };

  await writeFile(new URL('../site/data.json', import.meta.url), JSON.stringify(output, null, 2));
  console.log('Wrote site/data.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
