const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const PYTHON_API = process.env.PYTHON_API || "http://localhost:8000";

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ─── Proxy request to Python backend ─────────────────────────────────────────
function proxyRequest(req, res) {
  const targetUrl = new URL(PYTHON_API + req.url);
  const isHttps = targetUrl.protocol === "https:";
  const lib = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.hostname,
    },
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      "Content-Type": proxyRes.headers["content-type"] || "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Backend unavailable",
        detail: `Could not reach Python API at ${PYTHON_API}. Is it running?`,
      })
    );
  });

  req.pipe(proxyReq);
}

// ─── Serve static files ───────────────────────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(__dirname, "public", req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for SPA routing
      fs.readFile(path.join(__dirname, "public", "index.html"), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end("Not found");
        } else {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(data2);
        }
      });
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
}

// ─── Main server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // Proxy API and health calls to Python
  if (parsedUrl.pathname.startsWith("/api") || parsedUrl.pathname === "/health") {
    return proxyRequest(req, res);
  }

  // Serve static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n🍳 Recipe App running at http://localhost:${PORT}`);
  console.log(`🐍 Proxying API calls to ${PYTHON_API}\n`);
});
