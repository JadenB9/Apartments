import fs from "node:fs";
import { buildApartmentLinks } from "../src/data/links";

const path = "public/data/apartments.json";
const d = JSON.parse(fs.readFileSync(path, "utf8"));
let changed = 0;
for (const f of d.features) {
  const p = f.properties;
  const links = buildApartmentLinks({ name: p.name, lat: p.lat, lng: p.lng, town: p.town });
  if (JSON.stringify(links) !== JSON.stringify(p.links)) changed++;
  p.links = links;
}
// Keep the same compact single-line format the fetch pipeline produces.
fs.writeFileSync(path, JSON.stringify(d));
console.log(`Re-baked ${d.features.length} apartments, ${changed} link sets changed.`);
