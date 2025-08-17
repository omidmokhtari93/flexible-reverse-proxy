#!/usr/bin/env node

const { program } = require("commander");
const { createProxyServer } = require("../lib/proxy-server");

program
  .name("flexible-proxy")
  .description("A flexible reverse proxy server with configurable routing")
  .version("1.1.5")
  .option("-p, --port <port>", "Port to listen on", "8000")
  .option("-h, --host <host>", "Host to bind to", "localhost")
  .option("--routes-file <file>", "Load routes from a JSON file")
  .option("--watch", "Watch routes file for changes and auto-reload")
  .option("--verbose", "Enable verbose logging")
  .option(
    "--log-level <level>",
    "Log level: basic, detailed, full (default: basic)",
    "basic"
  )
  .option(
    "--preserve-headers",
    "Preserve all original headers (default: true)",
    true
  )
  .option("--no-preserve-headers", "Do not preserve original headers")
  .option(
    "--change-origin",
    "Change the origin header to target host (default: true)",
    true
  )
  .option("--no-change-origin", "Do not change the origin header")
  .option("--forward-all <target>", "Forward all traffic to a specific target (e.g., http://localhost:3000)")
  .allowUnknownOption() // Allows manual parsing of --route
  .parse();

const options = program.opts();

// Parse routes from command line arguments
const routes = {};
const args = process.argv.slice(2);
let i = 0;
while (i < args.length) {
  if (args[i] === "--route" || args[i] === "-r") {
    if (i + 1 < args.length) {
      const routeArg = args[i + 1];
      const [pattern, target] = routeArg.split(":");
      if (pattern && target) {
        routes[pattern] = target;
      } else {
        console.error(`Invalid route format: ${routeArg}. Use pattern:target`);
        process.exit(1);
      }
      i += 2; // Skip both --route and its value
    } else {
      console.error("--route requires a value");
      process.exit(1);
    }
  } else {
    i++;
  }
}

// Load routes from file if specified
if (options.routesFile) {
  try {
    const fs = require("fs");
    const routesFromFile = JSON.parse(
      fs.readFileSync(options.routesFile, "utf8")
    );
    Object.assign(routes, routesFromFile);
  } catch (error) {
    console.error(`Error loading routes file: ${error.message}`);
    process.exit(1);
  }
}

// Validate configuration
if (options.forwardAll) {
  // Forward-all mode: validate target format
  try {
    new URL(options.forwardAll);
  } catch (error) {
    console.error(`Invalid forward-all target: ${options.forwardAll}. Must be a valid URL (e.g., http://localhost:3000)`);
    process.exit(1);
  }
  
  // In forward-all mode, routes are ignored
  if (Object.keys(routes).length > 0) {
    console.log("⚠️  Warning: Routes specified but --forward-all is active. All traffic will be forwarded to the target.");
  }
  
  if (options.watch) {
    console.error("--watch option is not compatible with --forward-all mode");
    process.exit(1);
  }
} else {
  // Route-based mode: require routes
  if (Object.keys(routes).length === 0) {
    console.log(
      "No routes specified. Use --route, --routes-file, or --forward-all to configure proxy."
    );
    console.log(
      'Example: flexible-proxy --route "/api:http://localhost:3000" --route "/auth:https://auth.example.com"'
    );
    console.log("Example: flexible-proxy --routes-file routes.json --watch");
    console.log("Example: flexible-proxy --forward-all http://localhost:3000");
    process.exit(1);
  }
}

// Validate watch option
if (options.watch && !options.routesFile) {
  console.error("--watch option requires --routes-file to be specified");
  process.exit(1);
}

// Create and start the proxy server
const server = createProxyServer({
  port: parseInt(options.port),
  host: options.host,
  routes: routes,
  routesFile: options.routesFile,
  watchRoutes: options.watch,
  verbose: options.verbose || options.logLevel !== "basic",
  logLevel: options.logLevel,
  preserveHeaders: options.preserveHeaders,
  changeOrigin: options.changeOrigin,
  forwardAll: options.forwardAll,
});

server.start();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down proxy server...");
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down proxy server...");
  server.stop();
  process.exit(0);
});
