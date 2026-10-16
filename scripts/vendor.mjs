// Copies third-party browser assets from node_modules into www/vendor so the app works offline.
import { cpSync, mkdirSync } from "node:fs";
const v = "www/vendor";
mkdirSync(`${v}/leaflet/images`, { recursive: true });
mkdirSync(`${v}/fonts`, { recursive: true });
cpSync("node_modules/leaflet/dist/leaflet.js", `${v}/leaflet/leaflet.js`);
cpSync("node_modules/leaflet/dist/leaflet.css", `${v}/leaflet/leaflet.css`);
cpSync("node_modules/leaflet/dist/images", `${v}/leaflet/images`, { recursive: true });
for (const w of [500, 600, 700]) {
  cpSync(`node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-${w}-normal.woff2`, `${v}/fonts/barlow-condensed-${w}.woff2`);
}
console.log("vendor assets copied");
