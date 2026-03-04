const fs = require("fs");
const path = require("path");

const BASE_DIR = process.cwd();

function readFile(filePath) {
  try {
    const fullPath = path.join(BASE_DIR, filePath);
    return fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    return "ERROR: Cannot read file.";
  }
}

function writeFile(filePath, content) {
  try {
    const fullPath = path.join(BASE_DIR, filePath);
    fs.writeFileSync(fullPath, content);
    return "File written successfully.";
  } catch (err) {
    return "ERROR: Cannot write file.";
  }
}

function listFiles() {
  try {
    return fs.readdirSync(BASE_DIR).join("\n");
  } catch (err) {
    return "ERROR: Cannot list directory.";
  }
}

module.exports = { readFile, writeFile, listFiles };