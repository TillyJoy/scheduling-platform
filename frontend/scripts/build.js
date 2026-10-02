const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(__dirname, "..", "src");
const outputDir = path.resolve(__dirname, "..", "dist");
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
for (const file of ["index.html", "app.js", "fieldExecutionOfflineQueue.js"]) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(outputDir, file));
}
console.log("Frontend build completed:", outputDir);
