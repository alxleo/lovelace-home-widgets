import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const root = process.cwd();
const port = Number(process.env.WIDGET_PREVIEW_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("WIDGET_PREVIEW_PORT must be a valid TCP port");
const previewUrl = new URL("http://127.0.0.1:4173/preview/");
previewUrl.port = String(port);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".map": "application/json" };

createServer((request, response) => {
  let file;
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (requestPath === "" || requestPath.endsWith("/")) requestPath += requestPath === "" ? "preview/index.html" : "index.html";
    file = resolve(root, requestPath);
    const contained = relative(root, file);
    if (contained === ".." || contained.startsWith(`..${sep}`) || isAbsolute(contained)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end(error instanceof URIError ? "Bad request" : "Not found");
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Preview: ${previewUrl.href}`));
