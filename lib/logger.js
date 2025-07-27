const chalk = require("chalk");
const winston = require("winston");

class PrettyLogger {
  constructor(config = {}) {
    this.logLevel = config.logLevel || "basic";
    this.verbose = config.verbose || false;
    this.colors = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      request: chalk.cyan,
      response: chalk.magenta,
      timestamp: chalk.gray,
      method: chalk.white,
      url: chalk.blue,
      target: chalk.green,
      status: chalk.white,
      headers: chalk.gray,
      body: chalk.yellow,
      requestId: chalk.cyan,
    };

    // Create Winston logger
    this.logger = winston.createLogger({
      level:
        this.logLevel === "full"
          ? "debug"
          : this.logLevel === "detailed"
          ? "info"
          : "warn",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  // Server startup logs
  serverStart(port, host, logLevel, routes = {}) {
    console.log("\n" + chalk.bold.blue("🚀 Flexible Reverse Proxy Server"));
    console.log(chalk.gray("═".repeat(50)));
    console.log(
      `${chalk.blue("📍")} Server running at ${chalk.green(
        `http://${host}:${port}`
      )}`
    );
    console.log(`${chalk.blue("📊")} Log level: ${chalk.yellow(logLevel)}`);

    if (Object.keys(routes).length > 0) {
      console.log(`${chalk.blue("🛣️")} Routes configured:`);
      Object.entries(routes).forEach(([pattern, target]) => {
        console.log(
          `   ${chalk.cyan(pattern)} ${chalk.gray("→")} ${chalk.green(target)}`
        );
      });
    }
    console.log(chalk.gray("═".repeat(50)) + "\n");
  }

  // Helper: filter and format critical headers
  filterCriticalHeaders(headers) {
    if (!headers) return {};
    const critical = [
      "authorization",
      "content-type",
      "accept",
      "user-agent",
      "cookie",
      "set-cookie",
      "x-forwarded-for",
      "host",
      "referer",
      "origin",
    ];
    const result = {};
    for (const key of Object.keys(headers)) {
      if (critical.includes(key.toLowerCase())) {
        result[key] = headers[key];
      }
    }
    return result;
  }

  // Helper: format large header values in one line, truncating if needed
  formatHeaderValue(key, value) {
    const maxLen = 120;
    if (
      (key.toLowerCase() === "cookie" || key.toLowerCase() === "set-cookie") &&
      typeof value === "string"
    ) {
      if (value.length > maxLen) {
        return value.slice(0, maxLen) + "...";
      }
      return value;
    }
    if (Array.isArray(value) && key.toLowerCase() === "set-cookie") {
      // Join all cookies into one line, truncate if needed
      const joined = value.join("; ");
      if (joined.length > maxLen) {
        return joined.slice(0, maxLen) + "...";
      }
      return joined;
    }
    return value;
  }

  // Request logs
  logRequest(requestId, method, url, target, headers = null, body = null) {
    const timestamp = new Date().toISOString();
    const methodColor = this.getMethodColor(method);

    console.log(
      `\n${this.colors.timestamp(`[${timestamp}]`)} ${this.colors.requestId(
        `[${requestId}]`
      )}`
    );
    console.log(
      `${methodColor(method.padEnd(6))} ${this.colors.url(url)} ${chalk.gray(
        "→"
      )} ${this.colors.target(target)}`
    );

    if (this.logLevel === "detailed" || this.logLevel === "full") {
      if (headers) {
        let shownHeaders = headers;
        if (this.logLevel !== "full") {
          shownHeaders = this.filterCriticalHeaders(headers);
        }
        if (Object.keys(shownHeaders).length > 0) {
          console.log(`${chalk.gray("📋")} Headers:`);
          Object.entries(shownHeaders).forEach(([key, value]) => {
            const formatted = this.formatHeaderValue(key, value);
            console.log(`   ${chalk.cyan(key)}: ${chalk.gray(formatted)}`);
          });
        }
      }
    }

    if (
      this.logLevel === "full" &&
      body &&
      ["POST", "PUT", "PATCH"].includes(method)
    ) {
      console.log(`${chalk.gray("📦")} Body: ${chalk.yellow(body)}`);
    }
  }

  // Response logs
  logResponse(
    requestId,
    statusCode,
    statusMessage,
    headers = null,
    body = null,
    url = null
  ) {
    const timestamp = new Date().toISOString();

    console.log(
      `${this.colors.timestamp(`[${timestamp}]`)} ${this.colors.requestId(
        `[${requestId}]`
      )}`
    );

    // Only log status if we have a status code
    if (statusCode) {
      const statusColor = this.getStatusColor(statusCode);
      const statusText = statusMessage || this.getStatusText(statusCode);
      console.log(`${statusColor(`${statusCode} ${statusText}`)}`);
    }

    // Show URL if provided
    if (url) {
      console.log(`${chalk.gray("📍")} URL: ${this.colors.url(url)}`);
    }

    if (this.logLevel === "full" && headers) {
      // Show all headers in full mode
      console.log(`${chalk.gray("📋")} Response Headers:`);
      Object.entries(headers).forEach(([key, value]) => {
        const formatted = this.formatHeaderValue(key, value);
        console.log(`   ${chalk.cyan(key)}: ${chalk.gray(formatted)}`);
      });
    } else if (this.logLevel === "detailed" && headers) {
      // Only show critical headers in detailed mode
      const shownHeaders = this.filterCriticalHeaders(headers);
      if (Object.keys(shownHeaders).length > 0) {
        console.log(`${chalk.gray("📋")} Response Headers:`);
        Object.entries(shownHeaders).forEach(([key, value]) => {
          const formatted = this.formatHeaderValue(key, value);
          console.log(`   ${chalk.cyan(key)}: ${chalk.gray(formatted)}`);
        });
      }
    }

    if (this.logLevel === "full" && body) {
      console.log(`${chalk.gray("📦")} Response Body: ${chalk.yellow(body)}`);
    }
  }

  // Error logs
  logError(requestId, error, url = null) {
    const timestamp = new Date().toISOString();
    console.log(
      `${this.colors.timestamp(`[${timestamp}]`)} ${this.colors.requestId(
        `[${requestId}]`
      )}`
    );

    // Extract meaningful error message
    let errorMessage = "Unknown error";
    if (error) {
      if (typeof error === "string") {
        errorMessage = error;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.code) {
        errorMessage = `Error ${error.code}: ${
          error.syscall || "Unknown operation"
        }`;
      } else {
        errorMessage = error.toString();
      }
    }

    console.log(`${chalk.red("❌")} Proxy error: ${chalk.red(errorMessage)}`);

    // Show URL if provided
    if (url) {
      console.log(`${chalk.gray("📍")} URL: ${this.colors.url(url)}`);
    }

    // Log additional error details if available
    if (error && error.code) {
      console.log(`   ${chalk.gray("Code:")} ${chalk.yellow(error.code)}`);
    }
    if (error && error.address) {
      console.log(
        `   ${chalk.gray("Address:")} ${chalk.yellow(error.address)}`
      );
    }
    if (error && error.port) {
      console.log(`   ${chalk.gray("Port:")} ${chalk.yellow(error.port)}`);
    }
  }

  // Info logs
  info(message) {
    console.log(`${chalk.blue("ℹ️")} ${message}`);
  }

  // Success logs
  success(message) {
    console.log(`${chalk.green("✅")} ${message}`);
  }

  // Warning logs
  warning(message) {
    console.log(`${chalk.yellow("⚠️")} ${message}`);
  }

  // Error logs
  error(message) {
    console.log(`${chalk.red("❌")} ${message}`);
  }

  // Helper methods
  getMethodColor(method) {
    const colors = {
      GET: chalk.green,
      POST: chalk.blue,
      PUT: chalk.yellow,
      DELETE: chalk.red,
      PATCH: chalk.magenta,
      OPTIONS: chalk.cyan,
    };
    return colors[method] || chalk.white;
  }

  getStatusColor(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return chalk.green;
    if (statusCode >= 300 && statusCode < 400) return chalk.yellow;
    if (statusCode >= 400 && statusCode < 500) return chalk.red;
    if (statusCode >= 500) return chalk.red;
    return chalk.white;
  }

  getStatusText(statusCode) {
    const statusTexts = {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved Permanently",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
      504: "Gateway Timeout",
    };
    return statusTexts[statusCode] || "Unknown";
  }

  // Route not found
  logRouteNotFound(requestId, url) {
    const timestamp = new Date().toISOString();
    console.log(
      `${this.colors.timestamp(`[${timestamp}]`)} ${this.colors.requestId(
        `[${requestId}]`
      )}`
    );
    console.log(`${chalk.yellow("⚠️")} Route not found: ${chalk.cyan(url)}`);
  }

  // CORS preflight
  logCorsPreflight(requestId) {
    const timestamp = new Date().toISOString();
    console.log(
      `${this.colors.timestamp(`[${timestamp}]`)} ${this.colors.requestId(
        `[${requestId}]`
      )}`
    );
    console.log(`${chalk.cyan("🔄")} CORS preflight request handled`);
  }
}

module.exports = { PrettyLogger };
