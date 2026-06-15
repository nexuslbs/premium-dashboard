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

// Compute content hashes for cache busting
const jsContent = fs.readFileSync(path.join(DIST, "assets/index.js"), "utf-8");
const jsHash = crypto.createHash("md5").update(jsContent).digest("hex").slice(0, 8);
const jsFile = `index.${jsHash}.js`;
fs.renameSync(
  path.join(DIST, "assets/index.js"),
  path.join(DIST, "assets", jsFile)
);

// Copy and hash CSS
let css = fs.readFileSync(path.resolve(__dirname, "src/style.css"), "utf-8");
css = css.replace('@import "tailwindcss";\n', "");
css = css.replace('@import "tailwindcss";', "");
fs.writeFileSync(path.join(DIST, "assets/style.css"), css);

const cssContent = fs.readFileSync(path.join(DIST, "assets/style.css"), "utf-8");
const cssHash = crypto.createHash("md5").update(cssContent).digest("hex").slice(0, 8);
const cssFile = `style.${cssHash}.css`;
fs.renameSync(
  path.join(DIST, "assets/style.css"),
  path.join(DIST, "assets", cssFile)
);

// Copy index.html and inject hashed filenames
let html = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");

html = html.replace(
  '<script type="module" src="/src/index.ts"></script>',
  `<script type="module" src="/assets/${jsFile}"></script>`
);

html = html.replace(
  '<link rel="stylesheet" href="/src/style.css" />',
  `<link href="https://cdn.jsdelivr.net/npm/tailwindcss@4.1.6/index.min.css" rel="stylesheet">\n  <link rel="stylesheet" href="/assets/${cssFile}" />`
);

// Write index.html
fs.writeFileSync(path.join(DIST, "index.html"), html);

// Copy favicon
const faviconSrc = path.resolve(__dirname, "public/favicon.svg");
if (fs.existsSync(faviconSrc)) {
  fs.copyFileSync(faviconSrc, path.join(DIST, "favicon.svg"));
}

console.log("Build complete!");
console.log(`  ${DIST}/index.html`);
console.log(`  ${DIST}/assets/${jsFile}`);
console.log(`  ${DIST}/assets/${cssFile}`);
