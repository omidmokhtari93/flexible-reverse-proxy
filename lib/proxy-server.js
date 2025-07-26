const http = require("http");
const httpProxy = require("http-proxy");
const { PrettyLogger } = require("./logger");

function createProxyServer(config = {}) {
  const {
    port = 8000,
    host = "localhost",
    routes = {},
    verbose = false,
    logLevel = "basic",
    preserveHeaders = true,
    changeOrigin = true,
  } = config;

  // Initialize pretty logger
  const logger = new PrettyLogger({ logLevel, verbose });

  const proxy = httpProxy.createProxyServer({
    changeOrigin: changeOrigin,
    preserveHeaderKeyCase: true,
    xfwd: true, // Add X-Forwarded-* headers
    secure: false, // Allow self-signed certificates
  });

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;

    // Set CORS headers
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Channel"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400");
      res.setHeader("Vary", "Origin");
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      const requestId = Math.random().toString(36).substring(2, 15);
      logger.logCorsPreflight(requestId);
      res.writeHead(204, "No Content");
      res.end();
      return;
    }

    // Find matching route
    let target = null;
    for (const [pattern, routeTarget] of Object.entries(routes)) {
      if (req.url.startsWith(pattern)) {
        target = routeTarget;
        break;
      }
    }

    if (!target) {
      const requestId = Math.random().toString(36).substring(2, 15);
      logger.logRouteNotFound(requestId, req.url);
      res.writeHead(404, "Not Found", { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    // Ensure all headers are preserved
    if (preserveHeaders) {
      // Remove any headers that might interfere with proxying
      delete req.headers["host"];
      delete req.headers["connection"];
      delete req.headers["content-length"];
    }

    // Generate request ID and log request
    const requestId = Math.random().toString(36).substring(2, 15);
    const headers =
      logLevel === "detailed" || logLevel === "full" ? req.headers : null;

    // Log request body for full logging
    let body = null;
    if (logLevel === "full" && ["POST", "PUT", "PATCH"].includes(req.method)) {
      let bodyChunks = [];
      req.on("data", (chunk) => {
        bodyChunks.push(chunk);
      });
      req.on("end", () => {
        if (bodyChunks.length > 0) {
          body = Buffer.concat(bodyChunks).toString();
        }
        logger.logRequest(
          requestId,
          req.method,
          req.url,
          target,
          headers,
          body
        );
      });
    } else {
      logger.logRequest(requestId, req.method, req.url, target, headers, body);
    }

    // Log response details based on log level
    const originalWriteHead = res.writeHead;
    const originalEnd = res.end;

    res.writeHead = function (statusCode, statusMessage, headers) {
      const responseHeaders = logLevel === "full" ? headers : null;
      logger.logResponse(
        requestId,
        statusCode,
        statusMessage,
        responseHeaders,
        null,
        req.url
      );
      return originalWriteHead.apply(this, arguments);
    };

    res.end = function (chunk, encoding) {
      if (logLevel === "full" && chunk) {
        const responseBody = chunk.toString();
        // Only log response body, not status info here
        logger.logResponse(requestId, null, null, null, responseBody, req.url);
      }
      return originalEnd.apply(this, arguments);
    };

    // Proxy the request
    proxy.web(req, res, { target, changeOrigin: changeOrigin }, (err) => {
      logger.logError(requestId, err, req.url);
      res.writeHead(502, "Bad Gateway", { "Content-Type": "text/plain" });
      res.end("Proxy error");
    });
  });

  return {
    start: () => {
      server.listen(port, host, () => {
        logger.serverStart(port, host, logLevel, routes);
      });
    },
    stop: () => {
      server.close();
    },
  };
}

module.exports = { createProxyServer };
