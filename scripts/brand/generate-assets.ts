/**
 * Writes the static brand files (favicons, apple-touch icon and the desktop app
 * icons) from the same `KairoMark` the interface renders, so the files and the
 * screens cannot drift apart. Run with `bun run brand:assets`.
 *
 * - Web: favicon.ico, favicon-16.png, favicon-32.png, favicon-dark-32.png and
 *   apple-touch-icon.png in each web app's `public/` folder.
 * - Desktop (`apps/desktop/src-tauri/icons`): 32x32.png, 128x128.png,
 *   128x128@2x.png on the accent plate, icon.ico without a plate (Windows) and
 *   icon.icns on the macOS plate. The .icns needs macOS (`iconutil`); elsewhere
 *   it is skipped.
 *
 * The rule for five layers or the three-layer cut follows the symbol height in
 * px at each output size (see spec/components/kairo-mark.md).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { darkTokens, tokens } from "../../packages/tokens/generated/tokens";
import { KairoMark } from "../../packages/ui/src/kairo-mark";

const ROOT = resolve(import.meta.dir, "..", "..");

// React comes from the UI package, so the component and the renderer share one copy.
const fromUi = createRequire(join(ROOT, "packages/ui/package.json"));
const { createElement } = fromUi("react") as { createElement: (type: unknown, props: object) => unknown };
const { renderToStaticMarkup } = fromUi("react-dom/server") as { renderToStaticMarkup: (element: unknown) => string };

// sharp is installed as a dependency of Next (apps/landing); the lockfile is untouched.
const nextDir = dirname(createRequire(join(ROOT, "apps/landing/package.json")).resolve("next/package.json"));
const sharp = createRequire(join(nextDir, "package.json"))("sharp") as (input: Buffer) => { png(): { toBuffer(): Promise<Buffer> } };

const ASPECT = 572 / 509; // symbol width / height
const PLATE_RADIUS = 0.225; // corner radius of the app icon plate, as a fraction of its side
const PLATE_SYMBOL = 0.74; // symbol width on the plate, as a fraction of its side

type Layers = "auto" | 3 | 5;

/** The symbol as a nested <svg> placed at x, y; `width` is the symbol width in px. */
function symbol(width: number, x: number, y: number, layers: Layers = "auto"): string {
  const markup = renderToStaticMarkup(createElement(KairoMark, { size: width / ASPECT, layers }));
  return markup.replace("<svg ", `<svg x="${x}" y="${y}" `);
}

/** The symbol centered in a square of `side`, `fraction` of it wide. */
function centered(side: number, fraction: number, layers: Layers = "auto"): string {
  const width = side * fraction;
  return symbol(width, (side - width) / 2, (side - width / ASPECT) / 2, layers);
}

const canvas = (side: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">${body}</svg>`;
const plate = (side: number, fill: string, radius = PLATE_RADIUS) => `<rect width="${side}" height="${side}" rx="${side * radius}" fill="${fill}"/>`;

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

// --- pieces ------------------------------------------------------------------

/** Symbol alone on a transparent square: browser tab and Windows. */
const bare = (side: number, layers: Layers = "auto") => canvas(side, centered(side, 1, layers));
/** Symbol on the accent plate with rounded corners: app icon. */
const accentPlate = (side: number) => canvas(side, plate(side, tokens["accent.default"]) + centered(side, PLATE_SYMBOL));
/** Full-bleed accent square: iOS applies its own corner mask to apple-touch icons. */
const touchIcon = (side: number) => canvas(side, plate(side, tokens["accent.default"], 0) + centered(side, PLATE_SYMBOL));
/** Dark plate for browsers in dark mode. */
const darkPlate = (side: number) => canvas(side, plate(side, darkTokens["surface.page"]) + centered(side, PLATE_SYMBOL));

/** macOS: a white plate 824 of 1024 with the system shadow baked in. */
function macPlate(side: number): string {
  const scale = side / 1024;
  const plateSide = 824 * scale;
  const offset = (side - plateSide) / 2;
  const ink = tokens["text.primary"];
  const blur = (id: string, deviation: number) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${deviation}"/></filter>`;
  const shadow = (dy: number, deviation: number, opacity: number, id: string) =>
    `<rect x="${offset}" y="${offset + dy}" width="${plateSide}" height="${plateSide}" rx="${plateSide * 0.228}" fill="${ink}" fill-opacity="${opacity}" filter="url(#${id})"/>`;
  const body =
    `<defs>${blur("soft", 98 * scale)}${blur("tight", 9 * scale)}</defs>` +
    shadow(90 * scale, 98 * scale, 0.14, "soft") +
    shadow(9 * scale, 9 * scale, 0.1, "tight") +
    `<rect x="${offset}" y="${offset}" width="${plateSide}" height="${plateSide}" rx="${plateSide * 0.228}" fill="${tokens["surface.page"]}"/>` +
    symbol(plateSide * 0.76, offset + plateSide * 0.12, offset + (plateSide - (plateSide * 0.76) / ASPECT) / 2);
  return canvas(side, body);
}

/** An .ico holding PNG images (the format Windows and browsers read for every size). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, data }, index) => {
    const at = index * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, at);
    entries.writeUInt8(size >= 256 ? 0 : size, at + 1);
    entries.writeUInt16LE(1, at + 4); // color planes
    entries.writeUInt16LE(32, at + 6); // bits per pixel
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...images.map((image) => image.data)]);
}

// --- outputs -----------------------------------------------------------------

const written: string[] = [];
function write(path: string, data: Buffer | string) {
  const target = join(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  written.push(path);
}

// Favicon 32 draws the five layers and 16 the cut, as designed.
const favicon16 = await png(bare(16, 3));
const favicon32 = await png(bare(32, 5));
const faviconDark = await png(darkPlate(32));
const appleTouch = await png(touchIcon(180));
const faviconIco = ico([
  { size: 16, data: favicon16 },
  { size: 32, data: favicon32 },
]);

for (const app of ["dashboard", "landing", "kelan"]) {
  const dir = `apps/${app}/public`;
  write(`${dir}/favicon.ico`, faviconIco);
  write(`${dir}/favicon-16.png`, favicon16);
  write(`${dir}/favicon-32.png`, favicon32);
  write(`${dir}/favicon-dark-32.png`, faviconDark);
  write(`${dir}/apple-touch-icon.png`, appleTouch);
}

const icons = "apps/desktop/src-tauri/icons";
write(`${icons}/32x32.png`, await png(accentPlate(32)));
write(`${icons}/128x128.png`, await png(accentPlate(128)));
write(`${icons}/128x128@2x.png`, await png(accentPlate(256)));
write(
  `${icons}/icon.ico`,
  ico(await Promise.all([16, 24, 32, 48, 64, 128, 256].map(async (size) => ({ size, data: await png(bare(size)) })))),
);

if (process.platform === "darwin" && existsSync("/usr/bin/iconutil")) {
  const iconset = join(mkdtempSync(join(tmpdir(), "kairo-iconset-")), "icon.iconset");
  mkdirSync(iconset);
  const sizes: [string, number][] = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];
  for (const [name, size] of sizes) writeFileSync(join(iconset, name), await png(macPlate(size)));
  const output = join(dirname(iconset), "icon.icns");
  execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", output]);
  write(`${icons}/icon.icns`, readFileSync(output));
  rmSync(dirname(iconset), { recursive: true, force: true });
} else {
  console.log("skipped icon.icns: it needs macOS (iconutil)");
}

console.log(`wrote ${written.length} files:\n${written.map((path) => `  ${path}`).join("\n")}`);
