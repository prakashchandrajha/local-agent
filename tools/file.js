const fs = require("fs");

function readFile(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (err) {
    return "ERROR: Cannot read file.";
  }
}

function writeFile(path, content) {
  try {
    fs.writeFileSync(path, content);
    return "File written successfully.";
  } catch (err) {
    return "ERROR: Cannot write file.";
  }
}

module.exports = { readFile, writeFile };