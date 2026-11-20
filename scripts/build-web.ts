import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const out = "dist/web";
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
  if (entry !== ".vercel") rmSync(`${out}/${entry}`, { recursive: true, force: true });
}

const built = await Bun.build({
  entrypoints: ["main.web.ts"],
  target: "browser",
  minify: true,
  naming: "main.[hash].[ext]",
  outdir: out,
});

if (!built.success) {
  for (const log of built.logs) console.error(log);
  process.exit(1);
}

const bundle = built.outputs[0].path.split("/").pop() ?? "main.js";
mkdirSync(`${out}/src`, { recursive: true });
copyFileSync("src/style.css", `${out}/src/style.css`);
if (existsSync("assets")) {
  cpSync("assets", `${out}/assets`, { recursive: true });
}

const html = await Bun.file("index.html").text();
writeFileSync(`${out}/index.html`, html.replace("/main.web.ts", `./${bundle}`));

writeFileSync(
  `${out}/vercel.json`,
  `${JSON.stringify(
    {
      headers: [
        { source: "/index.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
        { source: "/", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`${out}/${bundle}`);
