const { createProxyServer } = require("./lib/proxy-server");

// Example 1: Route-based configuration (reverse proxy)
const routes = {};

// Create and start the proxy server with route-based configuration
const server = createProxyServer({
  port: 8000,
  host: "localhost",
  routes: routes,
  verbose: true,
});

server.start();

// Example 2: Forward-all configuration (forward proxy)
// Uncomment the following to forward ALL traffic to a specific target:
/*
const forwardAllServer = createProxyServer({
  port: 8001,
  host: "localhost",
  forwardAll: "http://localhost:3000", // All traffic goes to this target
  verbose: true,
});

forwardAllServer.start();
*/
