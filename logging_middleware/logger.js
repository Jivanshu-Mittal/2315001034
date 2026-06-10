"use strict";

class Logger {
  constructor(defaultContext = "System") {
    this.defaultContext = defaultContext;
  }

  debug(context, message, meta) {
    this._log("DEBUG", context || this.defaultContext, message, meta);
  }

  info(context, message, meta) {
    this._log("INFO", context || this.defaultContext, message, meta);
  }

  warn(context, message, meta) {
    this._log("WARN", context || this.defaultContext, message, meta);
  }

  error(context, message, meta) {
    this._log("ERROR", context || this.defaultContext, message, meta);
  }

  _log(level, context, message, meta) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...(meta ? { meta } : {})
    };
    process.stdout.write(JSON.stringify(logEntry) + "\n");
  }
}

module.exports = new Logger();
