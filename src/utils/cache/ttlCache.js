import { fileURLToPath } from 'url';
import TTLCache from '@isaacs/ttlcache';

const disposer = (value, key, reason) => {
    console.log(`🔥 Evicting ${key} (${value.name}) from cache (${reason})!`);
};
// updateAgeOnGet resets the TTL upon a get - not likely to be important, and likely not needed
const cache = new TTLCache({ max: 11, ttl: 3000, updateAgeOnGet: false, dispose: disposer });

async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} (${response.statusText})`);
        }
        const data = await response.json(); // or response.text(), depending on the API
        return data;
    } catch (error) {
        console.error(`Error fetching data from ${url}: ${error}`);
        throw error; // Re-throw the error so the caller knows something went wrong
    }
}

async function fetchCached(url, fetchFunction) {
    if (cache.has(url)) {
        console.log(`✅ Cache hit for ${url} (TTL=${cache.getRemainingTTL(url)})`);
        return cache.get(url);
    } else {
        try {
            const data = await fetchFunction(url);
            cache.set(url, data);
            console.log(`📦 Stored data in cache for ${url}`);
            return data;
        } catch (error) {
            console.error(`Error in fetchFunction: ${error}`);
            throw error;
        }
    }
}

// used for testing TTL/expiry
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(numCharacters = 15, requestIntervalMs = 200) {
    // const url1 = 'https://rickandmortyapi.com/api/character';
    // let resp = await cache.fetch(url1);
    const charURLs = Array.from({ length: numCharacters }, (_, i) => i + 1).map(i => `https://rickandmortyapi.com/api/character/${i}`);
    const backtrack = Math.floor(numCharacters / 2);
    const urls = charURLs.concat(charURLs.slice(numCharacters - backtrack, numCharacters).reverse());
    for (const v of urls) {
        console.log(`\n▶️ Processing URL: ${v}`);
        let t0 = Date.now();
        const resp = await fetchCached(v, fetchData);
        let t1 = Date.now();
        let diff = (t1 - t0);
        console.log(`Got resp. (${resp.name}) in ${diff}ms; cache size = ${cache.size} / ${cache.max}`);
        const oldest = cache.keys().next().value;
        if (oldest) {
            const oldestData = cache.get(oldest);
            console.log(`oldest item: ${oldestData.name} with TTL ${cache.getRemainingTTL(oldest)}`);
        }
        await sleep(requestIntervalMs);
    }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {

    const nChars = 15;
    const reqInterval = 200;
    await runTest(nChars, reqInterval);

} else {
    // This code will run when this script is imported as a module.
    console.log('ttlCache is being imported as a module.');
}