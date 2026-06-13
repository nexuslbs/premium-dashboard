const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const crypto = require("crypto");
const DIST = path.resolve(__dirname, "dist");

// Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });

function fileHash(filePath) {
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex").slice(0, 8);
}

// Build TypeScript bundle
console.log("Building frontend...");
const jsOut = path.join(DIST, "assets/index.js");
const result = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, "src/index.ts")],
  bundle: true,
  outfile: jsOut,
  format: "esm",
  minify: true,
  sourcemap: false,
  target: "es2020",
});

if (result.errors.length > 0) {
  console.error("Build failed:");
  result.errors.forEach((e) => console.error(`  ${e.text}`));
  process.exit(1);
}

// Copy style.css
let css = fs.readFileSync(path.resolve(__dirname, "src/style.css"), "utf-8");
// Remove the @import "tailwindcss" line since we're using CDN
css = css.replace(/@import\s+"tailwindcss";?\s*/g, "");
const cssPath = path.join(DIST, "assets/style.css");
fs.writeFileSync(cssPath, css);

// Copy favicon
const faviconSrc = path.resolve(__dirname, "public/favicon.svg");
if (fs.existsSync(faviconSrc)) {
  fs.copyFileSync(faviconSrc, path.join(DIST, "favicon.svg"));
}

// Content-hash filenames for cache busting
const jsHash = fileHash(jsOut);
const cssHash = fileHash(cssPath);
const jsFile = `index.${jsHash}.js`;
const cssFile = `style.${cssHash}.css`;

fs.renameSync(jsOut, path.join(DIST, "assets", jsFile));
fs.renameSync(cssPath, path.join(DIST, "assets", cssFile));

// Copy index.html and modify to use hashed assets
let html = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");

// Replace module script with hashed script
html = html.replace(
  '<script type="module" src="/src/index.ts"></script>',
  '<script type="module" src="/assets/' + jsFile + '"></script>'
);

// Replace Tailwind import with CDN link
html = html.replace(
  '<link rel="stylesheet" href="/src/style.css" />',
  '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@4.1.6/index.min.css" rel="stylesheet">\n  <link rel="stylesheet" href="/assets/' + cssFile + '" />'
);

// Write index.html
fs.writeFileSync(path.join(DIST, "index.html"), html);

console.log("Build complete!");
console.log(`  ${DIST}/index.html`);
console.log(`  ${DIST}/assets/${jsFile}`);
console.log(`  ${DIST}/assets/${cssFile}`);
