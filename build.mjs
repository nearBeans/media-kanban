import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist/src/css", { recursive: true });
mkdirSync("dist/src/js", { recursive: true });
copyFileSync("index.html", "dist/index.html");
copyFileSync("src/css/sanitize.css", "dist/src/css/sanitize.css");
copyFileSync("src/css/style.css", "dist/src/css/style.css");
copyFileSync("src/js/main.js", "dist/src/js/main.js");
