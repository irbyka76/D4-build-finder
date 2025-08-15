// scripts/scrape-uniques.mjs
import axios from "axios";
import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";

const URL = "https://d4builds.gg/database/uniques/";

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CLASSES = ["Barbarian","Druid","Necromancer","Rogue","Sorcerer","Spiritborn"];

const classFrom = (txt) => {
  const found = CLASSES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(txt));
  return found ? found.toLowerCase() : null;
};

const rarityFrom = (line) => /mythic unique/i.test(line) ? "uber" : /unique/i.test(line) ? "unique" : null;

// Heuristic: try to keep “slot” like “Helm”, “Ring”, “1h Dagger”, etc.
const slotFrom = (line) => {
  const cleaned = norm(line);
  // Examples: "Mythic Unique Helm", "Unique 1h Dagger", "Unique Staff"
  const m = cleaned.match(/(?:mythic\\s+)?unique\\s+(.+)$/i);
  return m ? m[1] : null;
};

async function main() {
  console.log("Fetching", URL);
  const resp = await axios.get(URL, { headers: { "User-Agent": "D4-Build-Finder/1.0" } });
  const $ = cheerio.load(resp.data);

  const items = [];
  $("h2").each((_, el) => {
    const name = norm($(el).text());
    if (!name) return;

    // Collect siblings until the next h2
    const block = [];
    let n = $(el).next();
    while (n.length && n[0].tagName !== "h2") {
      block.push(norm(n.text()));
      n = n.next();
    }

    const firstLine = block.find(Boolean) || "";
    const rarity = rarityFrom(firstLine);
    const slot = slotFrom(firstLine);
    const blockText = block.join("\n");
    const klass = classFrom(blockText);

    // Try to pick the most “unique effect” looking line
    const effect = block.find((x) =>
      /Lucky Hit:|When |Gain a|Your .* deal|After you|While .+|Hits? (?:with|against)/i.test(x)
    ) || null;

    items.push({
      id: slug(name),
      name,
      rarity,   // "unique" | "uber"
      slot,     // e.g., "Helm", "Ring", "1h Dagger"
      class: klass,  // e.g., "barbarian" | "spiritborn" | null
      effect,
      source: URL
    });
  });

  mkdirSync("public", { recursive: true });
  const out = { updatedAt: new Date().toISOString(), items };
  writeFileSync("public/uniques.json", JSON.stringify(out, null, 2));
  console.log(`Wrote ${items.length} uniques → public/uniques.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
