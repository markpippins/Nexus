#!/usr/bin/env node
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// args: node clone-app.js "My Reddit Viewer" "https://reddit.com"
const [,, appName, appUrl] = process.argv;

if (!appName || !appUrl) {
  console.error("Usage: node clone-app.js \"App Name\" \"https://target-url.com\"");
  process.exit(1);
}

const templateDir = path.join(__dirname, "..");
const outputDir = path.join(__dirname, "..", `${appName.replace(/\s+/g, '-')}`);

if (fs.existsSync(outputDir)) {
  console.error(`❌ Directory ${outputDir} already exists.`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

function processFile(srcPath, destPath) {
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    for (const file of fs.readdirSync(srcPath)) {
      processFile(path.join(srcPath, file), path.join(destPath, file));
    }
  } else {
    let content = fs.readFileSync(srcPath, "utf8");
    const template = Handlebars.compile(content);
    content = template({ APP_NAME: appName, APP_URL: appUrl });
    fs.writeFileSync(destPath, content);
  }
}

for (const file of fs.readdirSync(templateDir)) {
  if (["scripts", "node_modules"].includes(file)) continue;
  processFile(path.join(templateDir, file), path.join(outputDir, file));
}

console.log(`✅ Created ${appName} in ${outputDir}`);
