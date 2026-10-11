import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

mkdirSync("dist/src/css", { recursive: true });
mkdirSync("dist/src/js", { recursive: true });
copyFileSync("index.html", "dist/index.html");
copyFileSync("src/css/sanitize.css", "dist/src/css/sanitize.css");
copyFileSync("src/css/style.css", "dist/src/css/style.css");
await build({
    entryPoints: ["src/ts/main.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: "dist/src/js/main.js",
});
