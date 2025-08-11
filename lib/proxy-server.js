const http = require("http");
const httpProxy = require("http-proxy");
const fs = require("fs");
const path = require("path");
const { match } = require("path-to-regexp");
const { PrettyLogger } = require("./logger");

function createProxyServer(config = {}) {
  const {
    port = 8000,
    host = "localhost",
    routes = {},
    routesFile = null,
    verbose = false,
    logLevel = "basic",
    preserveHeaders = true,
    changeOrigin = true,
    watchRoutes = false,
  } = config;

  // Initialize pretty logger
  const logger = new PrettyLogger({ logLevel, verbose });

  let currentRoutes = { ...routes };
  let server = null;
  let watcher = null;
  let routeMatchers = [];

  function compileRouteMatchers(routesObj) {
    return Object.entries(routesObj).map(([pattern, target]) => ({
      matcher: match(pattern, { decode: decodeURIComponent }),
      pattern,
      target,
    }));
  }

  function loadRoutesFromFile(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const routesData = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      logger.info(`Routes loaded from: ${filePath}`);
      return routesData;
    } catch (error) {
      logger.error(`Error loading routes file: ${error.message}`);
      return {};
    }
  }

  function createServer() {
    if (server) {
      server.close();
    }
    routeMatchers = compileRouteMatchers(currentRoutes);

    const proxy = httpProxy.createProxyServer({
      changeOrigin: changeOrigin,
      preserveHeaderKeyCase: true,
      xfwd: true,
      secure: false,
    });

    server = http.createServer((req, res) => {
      const origin = req.headers.origin;
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
      if (req.method === "OPTIONS") {
        const requestId = Math.random().toString(36).substring(2, 15);
        logger.logCorsPreflight(requestId);
        res.writeHead(204, "No Content");
        res.end();
        return;
      }
      // Find matching route using path-to-regexp
      let target = null;
      for (const { matcher, target: t } of routeMatchers) {
        if (matcher(req.url)) {
          target = t;
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
      if (preserveHeaders) {
        delete req.headers["host"];
        delete req.headers["connection"];
        delete req.headers["content-length"];
      }
      const requestId = Math.random().toString(36).substring(2, 15);
      const headers =
        logLevel === "detailed" || logLevel === "full" ? req.headers : null;
      let body = null;
      if (
        logLevel === "full" &&
        ["POST", "PUT", "PATCH"].includes(req.method)
      ) {
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
        logger.logRequest(
          requestId,
          req.method,
          req.url,
          target,
          headers,
          body
        );
      }
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
          logger.logResponse(
            requestId,
            null,
            null,
            null,
            responseBody,
            req.url
          );
        }
        return originalEnd.apply(this, arguments);
      };
      proxy.web(req, res, { target, changeOrigin: changeOrigin }, (err) => {
        logger.logError(requestId, err, req.url);
        res.writeHead(502, "Bad Gateway", { "Content-Type": "text/plain" });
        res.end("Proxy error");
      });
    });
    return server;
  }

  function setupFileWatcher() {
    if (!routesFile || !watchRoutes) {
      return;
    }
    const absolutePath = path.resolve(routesFile);
    if (!fs.existsSync(absolutePath)) {
      logger.warning(`Routes file not found: ${routesFile}`);
      return;
    }
    logger.info(`Watching routes file for changes: ${routesFile}`);
    watcher = fs.watch(absolutePath, (eventType, filename) => {
      if (eventType === "change") {
        logger.info(`Routes file changed: ${filename}`);
        setTimeout(() => {
          try {
            const newRoutes = loadRoutesFromFile(routesFile);
            if (Object.keys(newRoutes).length > 0) {
              currentRoutes = newRoutes;
              routeMatchers = compileRouteMatchers(currentRoutes);
              logger.success(`Routes updated successfully`);
              logger.info(
                `Current routes: ${Object.keys(currentRoutes).join(", ")}`
              );
            } else {
              logger.warning(
                `No valid routes found in file, keeping current routes`
              );
            }
          } catch (error) {
            logger.error(`Failed to reload routes: ${error.message}`);
          }
        }, 100);
      }
    });
    watcher.on("error", (error) => {
      logger.error(`File watcher error: ${error.message}`);
    });
  }

  return {
    start: () => {
      if (routesFile) {
        const fileRoutes = loadRoutesFromFile(routesFile);
        Object.assign(currentRoutes, fileRoutes);
      }
      routeMatchers = compileRouteMatchers(currentRoutes);
      server = createServer();
      server.listen(port, host, () => {
        logger.serverStart(port, host, logLevel, currentRoutes);
        setupFileWatcher();
      });
    },
    stop: () => {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    },
    reload: () => {
      if (routesFile) {
        const newRoutes = loadRoutesFromFile(routesFile);
        if (Object.keys(newRoutes).length > 0) {
          currentRoutes = newRoutes;
          routeMatchers = compileRouteMatchers(currentRoutes);
          logger.success(`Routes manually reloaded`);
          logger.info(
            `Current routes: ${Object.keys(currentRoutes).join(", ")}`
          );
        }
      }
    },
  };
}

module.exports = { createProxyServer };
