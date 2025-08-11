const { createProxyServer } = require("./lib/proxy-server");

// Example routes configuration
const routes = {
  "/api/v1/user/": "https://apimarket.mtnirancell.ir",
  "/account/api/v1/logout/": "https://apimarket.mtnirancell.ir",
  "/account/api/v1/sso": "https://apimarket.mtnirancell.ir",
  "/account/api/v1/login/": "https://apimarket.mtnirancell.ir",

  "/api/v1/baseinfos": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts/:id": "http://10.234.233.109:8026",
  "/api/v1/rules/:id": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/giftcards/:id": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/rules": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/giftcards": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/categories": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/rules/export": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts/export": "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/activations/add/public":
    "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/activations/upload/private":
    "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts/add/public/percent":
    "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts/add/public/fixed":
    "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts/upload/private/fixed":
    "https://apimarket.mtnirancell.ir/promotion-qat",
  "/api/v1/discounts/upload/private/percent":
    "https://apimarket.mtnirancell.ir/promotion-qat",
};

// Create and start the proxy server with example configuration
const server = createProxyServer({
  port: 8000,
  host: "localhost",
  routes: routes,
  verbose: true,
});

server.start();
