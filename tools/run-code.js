"use strict";

const { exec } = require("child_process");

function runCode(command) {
  return new Promise((resolve) => {
    // Basic safety check
    if (command.includes("rm -rf") || command.includes("> /dev/sda")) {
      return resolve({ success: false, output: "Command blocked for safety." });
    }

    exec(command, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += `[STDOUT]\n${stdout}\n`;
      if (stderr) output += `[STDERR]\n${stderr}\n`;
      if (error) output += `[ERROR]\n${error.message}\n`;

      resolve({
        success: !error && !stderr,
        output: output.trim() || "[No output]"
      });
    });
  });
}

module.exports = { runCode };
