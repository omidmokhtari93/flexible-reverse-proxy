const { createProxyServer } = require("./lib/proxy-server");

// Example routes configuration
const routes = {
  "/api/v1/baseinfos": "http://10.234.233.109:8026",
  "/api/v1/rules": "http://10.234.233.109:8026",
  "/api/v1/discounts": "http://10.234.233.109:8026",
  "/api/v1/giftcards": "http://10.234.233.109:8026",
  "/account/api/v1/login/": "https://apimarket.mtnirancell.ir",
  "/api/v1/user/": "https://apimarket.mtnirancell.ir",
  "/account/api/v1/sso": "https://apimarket.mtnirancell.ir",
};

// Create and start the proxy server with example configuration
const server = createProxyServer({
  port: 8000,
  host: "localhost",
  routes: routes,
  verbose: true,
});

server.start();
