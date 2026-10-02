const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(__dirname, "..");
const outputDir = path.join(sourceDir, "dist");
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
for (const file of ["index.html", "app.js"]) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(outputDir, file));
}
console.log("Frontend build completed:", outputDir);
