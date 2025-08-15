// scripts/scrape-uniques.mjs
import axios from "axios";
import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";

const URL = "https://d4builds.gg/database/uniques/";
const UA = "D4-Build-Finder/1.0 (+github actions)";

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const CLASSES = ["Barbarian","Druid","Necromancer","Rogue","Sorcerer","Spiritborn"];

const classFrom = (txt) => {
  const found = CLASSES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(txt));
  return found ? found.toLowerCase() : null;
};
const rarityFrom = (line) => /mythic unique/i.test(line) ? "uber" : /unique/i.test(line) ? "unique" : null;
const slotFrom = (line) => {
  const m = norm(line).match(/(?:mythic\s+)?unique\s+(.+)$/i); // e.g., "Mythic Unique Helm" -> "Helm"
  return m ? m[1] : null;
};

async function fetchHTML(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const resp = await axios.get(url, {
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
        timeout: 20000,
        validateStatus: (s) => s >= 200 && s < 400, // accept 3xx too
        maxRedirects: 5,
      });
      return resp.data;
    } catch (e) {
      lastErr = e;
      console.warn(`[attempt ${i}/${tries}] fetch failed: ${e?.message || e}`);
      await new Promise(r => setTimeout(r, 1000 * i));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastErr?.message || lastErr}`);
}

async function main() {
  console.log("Fetching", URL);
  const html = await fetchHTML(URL);
  const $ = cheerio.load(html);

  const items = [];
  const h2s = $("h2");
  if (h2s.length === 0) {
    // Print a snippet to help debug HTML shape differences
    console.error("No <h2> elements found; page structure may have changed.");
    console.error("First 500 chars:", norm($.root().text()).slice(0, 500));
    throw new Error("Selector mismatch: h2 not found");
  }

  h2s.each((_, el) => {
    const name = norm($(el).text());
    if (!name) return;

    // Collect siblings until next h2
    const block = [];
    let n = $(el).next();
    while (n.length && n[0].tagName !== "h2") {
      const t = norm(n.text());
      if (t) block.push(t);
      n = n.next();
    }

    const firstLine = block.find(Boolean) || "";
    const rarity = rarityFrom(firstLine);
    const slot = slotFrom(firstLine);
    const blockText = block.join("\n");
    const klass = classFrom(blockText);

    const effect = block.find((x) =>
      /Lucky Hit:|When |Gain a|Your .* deal|After you|While .+|Hits? (?:with|against)/i.test(x)
    ) || null;

    items.push({
      id: slug(name),
      name,
      rarity,
      slot,
      class: klass,
      effect,
      source: URL
    });
  });

  mkdirSync("public", { recursive: true });
  const out = { updatedAt: new Date().toISOString(), items };
  writeFileSync("public/uniques.json", JSON.stringify(out, null, 2));
  console.log(`OK: wrote ${items.length} uniques → public/uniques.json`);
}

main().catch((e) => {
  console.error("SCRAPER ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
