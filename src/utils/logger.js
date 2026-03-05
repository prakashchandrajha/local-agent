"use strict";

/**
 * Structured logging utility with multiple log levels
 * Provides consistent logging format across the application
 */
class Logger {
  constructor(config) {
    this.level = config.logging.level;
    this.enableDebug = config.logging.enableDebug;
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    this.currentLevelValue = this.levels[this.level] || 1;
  }

  /**
   * Formats log message with timestamp and level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   * @returns {string} - Formatted log message
   */
  _formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(context).length > 0 ? 
      ` ${JSON.stringify(context)}` : "";
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  /**
   * Checks if the given level should be logged
   * @param {string} level - Log level to check
   * @returns {boolean} - Whether to log this level
   */
  _shouldLog(level) {
    const levelValue = this.levels[level] || 1;
    return levelValue >= this.currentLevelValue;
  }

  /**
   * Logs debug message
   * @param {string} message - Debug message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    if (this.enableDebug && this._shouldLog("debug")) {
      console.log(this._formatMessage("debug", message, context));
    }
  }

  /**
   * Logs info message
   * @param {string} message - Info message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    if (this._shouldLog("info")) {
      console.log(this._formatMessage("info", message, context));
    }
  }

  /**
   * Logs warning message
   * @param {string} message - Warning message
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    if (this._shouldLog("warn")) {
      console.warn(this._formatMessage("warn", message, context));
    }
  }

  /**
   * Logs error message
   * @param {string} message - Error message
   * @param {Object} context - Additional context
   */
  error(message, context = {}) {
    if (this._shouldLog("error")) {
      console.error(this._formatMessage("error", message, context));
    }
  }

  /**
   * Logs success message (info level with success formatting)
   * @param {string} message - Success message
   * @param {Object} context - Additional context
   */
  success(message, context = {}) {
    if (this._shouldLog("info")) {
      const timestamp = new Date().toISOString();
      const contextStr = Object.keys(context).length > 0 ? 
        ` ${JSON.stringify(context)}` : "";
      console.log(`✅ [${timestamp}] INFO: ${message}${contextStr}`);
    }
  }

  /**
   * Logs operation start
   * @param {string} operation - Operation name
   * @param {Object} context - Additional context
   */
  operationStart(operation, context = {}) {
    if (this._shouldLog("info")) {
      const timestamp = new Date().toISOString();
      const contextStr = Object.keys(context).length > 0 ? 
        ` ${JSON.stringify(context)}` : "";
      console.log(`🔄 [${timestamp}] INFO: Starting ${operation}${contextStr}`);
    }
  }

  /**
   * Logs operation completion
   * @param {string} operation - Operation name
   * @param {Object} context - Additional context
   */
  operationComplete(operation, context = {}) {
    if (this._shouldLog("info")) {
      const timestamp = new Date().toISOString();
      const contextStr = Object.keys(context).length > 0 ? 
        ` ${JSON.stringify(context)}` : "";
      console.log(`✅ [${timestamp}] INFO: Completed ${operation}${contextStr}`);
    }
  }

  /**
   * Logs operation failure
   * @param {string} operation - Operation name
   * @param {Error|string} error - Error details
   * @param {Object} context - Additional context
   */
  operationFail(operation, error, context = {}) {
    if (this._shouldLog("error")) {
      const timestamp = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : error;
      const errorContext = error instanceof Error ? 
        { stack: error.stack, ...context } : context;
      const contextStr = Object.keys(errorContext).length > 0 ? 
        ` ${JSON.stringify(errorContext)}` : "";
      console.error(`❌ [${timestamp}] ERROR: Failed ${operation}: ${errorMessage}${contextStr}`);
    }
  }

  /**
   * Creates a child logger with additional context
   * @param {Object} context - Default context for this logger
   * @returns {Object} - Child logger with bound context
   */
  child(context) {
    const parent = this;
    return {
      debug: (message, additionalContext = {}) => 
        parent.debug(message, { ...context, ...additionalContext }),
      info: (message, additionalContext = {}) => 
        parent.info(message, { ...context, ...additionalContext }),
      warn: (message, additionalContext = {}) => 
        parent.warn(message, { ...context, ...additionalContext }),
      error: (message, additionalContext = {}) => 
        parent.error(message, { ...context, ...additionalContext }),
      success: (message, additionalContext = {}) => 
        parent.success(message, { ...context, ...additionalContext }),
      operationStart: (operation, additionalContext = {}) => 
        parent.operationStart(operation, { ...context, ...additionalContext }),
      operationComplete: (operation, additionalContext = {}) => 
        parent.operationComplete(operation, { ...context, ...additionalContext }),
      operationFail: (operation, error, additionalContext = {}) => 
        parent.operationFail(operation, error, { ...context, ...additionalContext })
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Gets the logger singleton instance
 * @param {Object} config - Configuration object
 * @returns {Logger} - Logger instance
 */
function getLogger(config) {
  if (!instance) {
    instance = new Logger(config);
  }
  return instance;
}

module.exports = { Logger, getLogger };
