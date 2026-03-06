"use strict";

const fs = require("fs");
const path = require("path");

function readFileSync(filepath) {
  try {
    const fullPath = path.resolve(process.cwd(), filepath);
    if (!fs.existsSync(fullPath)) {
      return `Error: File not found at ${filepath}`;
    }
    return fs.readFileSync(fullPath, "utf-8");
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
}

function writeFileSync(filepath, content) {
  try {
    const fullPath = path.resolve(process.cwd(), filepath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, "utf-8");
    return `Success: Wrote to ${filepath}`;
  } catch (err) {
    return `Error writing file: ${err.message}`;
  }
}

module.exports = { readFileSync, writeFileSync };
