"use strict";

const path = require("path");

const allowedRoot = process.cwd();

const isSafePath = (targetPath) => {
  const resolved = path.resolve(allowedRoot, targetPath);
  return resolved.startsWith(allowedRoot);
};

const enforceSafePath = (targetPath) => {
  if (!isSafePath(targetPath)) {
    throw new Error(`Security Violation: Attempted to access file outside project root: ${targetPath}`);
  }
};

module.exports = { isSafePath, enforceSafePath };
