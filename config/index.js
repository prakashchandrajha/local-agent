"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Centralized configuration management
 * Supports environment-based configuration with validation
 */
class Config {
  constructor() {
    this.environment = process.env.NODE_ENV || "development";
    this.config = this._loadConfig();
    this._validateConfig();
  }

  /**
   * Loads configuration based on environment
   * @returns {Object} - Configuration object
   */
  _loadConfig() {
    const defaultConfig = {
      llm: {
        url: "http://localhost:11434/api/generate",
        model: "deepseek-coder:6.7b",
        maxRetries: 3,
        temperature: 0.1,
        maxTokens: 4000
      },
      conversation: {
        maxHistory: 20
      },
      memory: {
        enabled: true,
        maxEntries: 1000,
        file: "persistent_memory.jsonl",
        indexFile: "memory_index.json"
      },
      logging: {
        level: "info", // debug, info, warn, error
        enableDebug: false
      },
      project: {
        root: process.cwd(),
        docsPath: "docs/for-agent/AGENT_GUIDE.md",
        readmePath: "README.md"
      }
    };

    // Load environment-specific overrides
    const envConfig = this._loadEnvironmentConfig();
    
    // Load from .env file if exists
    const envFileConfig = this._loadEnvFile();

    return this._mergeConfigs(defaultConfig, envConfig, envFileConfig);
  }

  /**
   * Loads environment-specific configuration
   * @returns {Object} - Environment-specific config
   */
  _loadEnvironmentConfig() {
    const envConfigs = {
      development: {
        logging: {
          level: "debug",
          enableDebug: true
        }
      },
      production: {
        logging: {
          level: "warn",
          enableDebug: false
        },
        llm: {
          maxRetries: 5
        }
      },
      test: {
        logging: {
          level: "error",
          enableDebug: false
        },
        memory: {
          enabled: false
        }
      }
    };

    return envConfigs[this.environment] || {};
  }

  /**
   * Loads configuration from .env file
   * @returns {Object} - Environment file config
   */
  _loadEnvFile() {
    const envPath = path.join(process.cwd(), ".env");
    const config = {};

    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, "utf8");
        const lines = envContent.split("\n");
        
        lines.forEach(line => {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            
            // Map environment variables to config structure
            if (key === "OLLAMA_URL") config.llm = { ...config.llm, url: value };
            if (key === "OLLAMA_MODEL") config.llm = { ...config.llm, model: value };
            if (key === "DEBUG") config.logging = { ...config.logging, enableDebug: value === "true" };
            if (key === "LOG_LEVEL") config.logging = { ...config.logging, level: value };
            if (key === "MAX_RETRIES") config.llm = { ...config.llm, maxRetries: parseInt(value) };
          }
        });
      } catch (err) {
        console.warn("Warning: Could not read .env file:", err.message);
      }
    }

    return config;
  }

  /**
   * Merges multiple configuration objects
   * @param {...Object} configs - Configuration objects to merge
   * @returns {Object} - Merged configuration
   */
  _mergeConfigs(...configs) {
    return configs.reduce((result, config) => {
      return this._deepMerge(result, config);
    }, {});
  }

  /**
   * Deep merges two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} - Merged object
   */
  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this._deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Validates the configuration
   */
  _validateConfig() {
    const required = [
      "llm.url",
      "llm.model",
      "conversation.maxHistory",
      "logging.level"
    ];

    for (const path of required) {
      if (!this._getNestedValue(this.config, path)) {
        throw new Error(`Required configuration missing: ${path}`);
      }
    }

    // Validate log level
    const validLevels = ["debug", "info", "warn", "error"];
    if (!validLevels.includes(this.config.logging.level)) {
      throw new Error(`Invalid log level: ${this.config.logging.level}`);
    }

    // Validate numeric values
    if (this.config.llm.maxRetries < 0 || this.config.llm.maxRetries > 10) {
      throw new Error("llm.maxRetries must be between 0 and 10");
    }

    if (this.config.conversation.maxHistory < 1 || this.config.conversation.maxHistory > 100) {
      throw new Error("conversation.maxHistory must be between 1 and 100");
    }
  }

  /**
   * Gets nested value from object using dot notation
   * @param {Object} obj - Object to get value from
   * @param {string} path - Dot notation path
   * @returns {*} - Value at path
   */
  _getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Gets configuration value
   * @param {string} path - Dot notation path (e.g., "llm.url")
   * @returns {*} - Configuration value
   */
  get(path) {
    if (!path) return this.config;
    return this._getNestedValue(this.config, path);
  }

  /**
   * Sets configuration value
   * @param {string} path - Dot notation path
   * @param {*} value - Value to set
   */
  set(path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, this.config);
    
    target[lastKey] = value;
  }

  /**
   * Gets the current environment
   * @returns {string} - Current environment
   */
  getEnvironment() {
    return this.environment;
  }

  /**
   * Checks if debug mode is enabled
   * @returns {boolean} - Debug mode status
   */
  isDebug() {
    return this.config.logging.enableDebug;
  }
}

// Singleton instance
let instance = null;

/**
 * Gets the configuration singleton instance
 * @returns {Config} - Configuration instance
 */
function getConfig() {
  if (!instance) {
    instance = new Config();
  }
  return instance;
}

module.exports = { Config, getConfig };
