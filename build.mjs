const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "dist");

// Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });

// Build TypeScript bundle
console.log("Building frontend...");
const result = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, "src/index.ts")],
  bundle: true,
  outfile: path.join(DIST, "assets/index.js"),
  format: "esm",
  minify: true,
  sourcemap: false,
  target: "es2020",
  loader: {
    ".ts": "ts",
    ".svg": "dataurl",
  },
});

if (result.errors.length > 0) {
  console.error("Build failed:");
  result.errors.forEach((e) => console.error(`  ${e.text}`));
  process.exit(1);
}

// Copy index.html and modify to use built assets
let html = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");

// Replace module script with built script
html = html.replace(
  '<script type="module" src="/src/index.ts"></script>',
  '<script type="module" src="/assets/index.js"></script>'
);

// Remove the Tailwind CSS import from style.css and replace with CDN link
html = html.replace(
  '<link rel="stylesheet" href="/src/style.css" />',
  '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@4.1.6/index.min.css" rel="stylesheet">\n  <link rel="stylesheet" href="/assets/style.css" />'
);

// Copy style.css as-is (no Tailwind import needed - using CDN)
let css = fs.readFileSync(path.resolve(__dirname, "src/style.css"), "utf-8");
// Remove the @import "tailwindcss" line since we're using CDN
css = css.replace('@import "tailwindcss";\n', "");
css = css.replace('@import "tailwindcss";', "");
// Scope everything under .dashboard-layout to prevent CDN conflicts
fs.writeFileSync(path.join(DIST, "assets/style.css"), css);

// Copy favicon
const faviconSrc = path.resolve(__dirname, "public/favicon.svg");
if (fs.existsSync(faviconSrc)) {
  fs.copyFileSync(faviconSrc, path.join(DIST, "favicon.svg"));
}

// Write index.html
fs.writeFileSync(path.join(DIST, "index.html"), html);

console.log("Build complete!");
console.log(`  ${DIST}/index.html`);
console.log(`  ${DIST}/assets/index.js`);
console.log(`  ${DIST}/assets/style.css`);
