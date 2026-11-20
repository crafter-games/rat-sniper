import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 3456);
const ROOT = import.meta.dir;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = pathname.replace(/\.\./g, "");
    const filePath = join(ROOT, safePath);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = safePath.slice(safePath.lastIndexOf("."));
      return new Response(file, {
        headers: {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Rat Sniper running at http://localhost:${server.port}`);
