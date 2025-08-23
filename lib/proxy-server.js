const http = require("http");
const https = require("https");
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
    forwardAll = null, // New option: forward all traffic to this target
  } = config;

  // Initialize pretty logger
  const logger = new PrettyLogger({ logLevel, verbose });

  let currentRoutes = { ...routes };
  let server = null;
  let watcher = null;
  let routeMatchers = [];
  let defaultTarget = currentRoutes["*"] || null; // Catch-all target if provided

  // Agents (keepAlive disabled to avoid upstream resets)
  const httpAgent = new http.Agent({ keepAlive: false });
  const httpsAgent = new https.Agent({
    keepAlive: false,
    rejectUnauthorized: false,
    // Add more SSL options for debugging
    secureProtocol: 'TLSv1_2_method',
    ciphers: 'ALL',
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
  });

  function compileRouteMatchers(routesObj) {
    return Object.entries(routesObj)
      .filter(([pattern]) => pattern !== "*")
      .map(([pattern, target]) => ({
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

    // Only compile route matchers if not using forwardAll
    if (!forwardAll) {
      routeMatchers = compileRouteMatchers(currentRoutes);
    }

    const proxy = httpProxy.createProxyServer({
      changeOrigin: changeOrigin,
      preserveHeaderKeyCase: true,
      xfwd: true,
      secure: false,
      timeout: 60_000,
      proxyTimeout: 60_000,
    });

    // Tweak upstream request headers to reduce resets
    proxy.on("proxyReq", (proxyReq, req, res, options) => {
      try {
        // Only set Connection: close if the original request doesn't have keep-alive
        if (!req.headers.connection || req.headers.connection !== 'keep-alive') {
          proxyReq.setHeader("Connection", "close");
        }
        // Rewrite Origin/Referer/Host to target origin when changeOrigin
        if (options && options.target && changeOrigin) {
          try {
            const t = new URL(
              typeof options.target === "string"
                ? options.target
                : options.target.href
            );
            const targetOrigin = `${t.protocol}//${t.host}`;
            proxyReq.setHeader("Host", t.host);
            proxyReq.setHeader("Origin", targetOrigin);
            proxyReq.setHeader("Referer", targetOrigin + (req.url || "/"));
          } catch (_) {}
        }
        // Avoid compression edge-cases with some upstreams (keep if client didn't set)
        if (!proxyReq.getHeader("accept-encoding")) {
          proxyReq.setHeader("Accept-Encoding", "identity");
        }
      } catch (_) {}
    });

    // Prevent crashes on proxy emitter errors
    proxy.on("error", (err, req, res) => {
      try {
        const requestId = Math.random().toString(36).substring(2, 15);
        logger.logError(
          requestId,
          err,
          req && req.url ? req.url : ""
        );
        
        // Log more details about the error
        if (verbose) {
          logger.error(`Proxy error details: ${err.code || 'unknown'} - ${err.message}`);
          if (req && req.headers) {
            logger.error(`Request headers: ${JSON.stringify(req.headers)}`);
          }
        }
        
        if (res && !res.headersSent && res.writable) {
          res.writeHead(502, "Bad Gateway", { "Content-Type": "text/plain" });
        }
        if (res && res.writable) {
          res.end("Proxy error");
        }
      } catch (_) {}
    });

    server = http.createServer((req, res) => {
      const origin = req.headers.origin;
      // Only add CORS headers if there's an origin header (browser request)
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        );
        const requestedHeaders = req.headers["access-control-request-headers"];
        if (requestedHeaders) {
          res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
        } else {
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, Channel, hiddify-api-key, X-Requested-With"
          );
        }
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Max-Age", "86400");
        res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
      }
      if (req.method === "OPTIONS") {
        const requestId = Math.random().toString(36).substring(2, 15);
        logger.logCorsPreflight(requestId);
        res.writeHead(204, "No Content");
        res.end();
        return;
      }

      // Determine target based on configuration
      let target = null;
      let matchedRoute = null;

      if (forwardAll) {
        // Forward all traffic to the specified target
        target = forwardAll;
        matchedRoute = "* (forwardAll)";
      } else {
        // Find matching route using path-to-regexp
        for (const { matcher, target: t, pattern } of routeMatchers) {
          if (matcher(req.url)) {
            target = t;
            matchedRoute = pattern;
            break;
          }
        }
        // If no specific match, use wildcard default if available
        if (!target && defaultTarget) {
          target = defaultTarget;
          matchedRoute = "* (wildcard)";
        }
      }

      if (verbose) {
        logger.info(`Route matching: ${req.url} -> ${matchedRoute || 'no match'} -> ${target || 'no target'}`);
      }

      if (!target) {
        const requestId = Math.random().toString(36).substring(2, 15);
        logger.logRouteNotFound(requestId, req.url);
        res.writeHead(404, "Not Found", { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      if (verbose) {
        logger.info(`Proxying request to: ${target}${req.url}`);
      }

      if (preserveHeaders) {
        // Only delete headers that could cause conflicts, but preserve important ones
        delete req.headers["host"];
        // Don't delete connection header if it's explicitly set
        if (!req.headers.connection) {
          delete req.headers["connection"];
        }
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

      // Choose agent based on target protocol
      const useHttps =
        typeof target === "string" ? target.startsWith("https") : false;
      const agent = useHttps ? httpsAgent : httpAgent;

      if (verbose && useHttps) {
        logger.info(`Using HTTPS agent for target: ${target}`);
        logger.info(`HTTPS agent options: ${JSON.stringify(httpsAgent.options)}`);
      }

      // Avoid duplicating path segments when target already has a pathname
      let prependPath = true;
      try {
        if (typeof target === "string") {
          const parsed = new URL(target);
          const basePath = parsed.pathname || "/";
          if (basePath !== "/" && req.url.startsWith(basePath)) {
            prependPath = false;
          }
        }
      } catch (_) {}

      // One-time retry on ECONNRESET (idempotent methods only)
      const canRetry = ["GET", "HEAD", "OPTIONS"].includes(req.method || "GET");
      const RETRIED = Symbol.for("__frp_retried__");

      const doProxy = () => {
        proxy.web(
          req,
          res,
          {
            target,
            changeOrigin: changeOrigin,
            agent,
            timeout: 60_000,
            proxyTimeout: 60_000,
            prependPath,
          },
          (err) => {
            if (err && err.code === "ECONNRESET" && canRetry && !req[RETRIED]) {
              req[RETRIED] = true;
              return doProxy();
            }
            logger.logError(requestId, err, req.url);
            if (!res.headersSent) {
              res.writeHead(502, "Bad Gateway", {
                "Content-Type": "text/plain",
              });
            }
            if (res.writable) {
              res.end("Proxy error");
            }
          }
        );
      };

      doProxy();
    });

    // Prevent server from exiting on client parsing errors
    server.on("clientError", (err, socket) => {
      try {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      } catch (_) {}
    });

    server.on("error", (err) => {
      try {
        logger.error(`Server error: ${err.message}`);
      } catch (_) {}
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
              defaultTarget = currentRoutes["*"] || null;
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
      defaultTarget = currentRoutes["*"] || null;
      routeMatchers = compileRouteMatchers(currentRoutes);
      server = createServer();
      server.listen(port, host, () => {
        logger.serverStart(port, host, logLevel, currentRoutes, forwardAll);
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
          defaultTarget = currentRoutes["*"] || null;
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
