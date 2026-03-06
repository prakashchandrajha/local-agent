"use strict";

const { exec } = require("child_process");

class TestRunner {
  /**
   * Run tests using a given command and return the result
   * @param {string} command - Command to run tests (e.g., "npm test")
   * @returns {Promise<Object>} Object with { success, output }
   */
  runTests(command = "npm test") {
    return new Promise((resolve) => {
      console.log(`\n🧪 Running tests: ${command}`);
      
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        const output = (stdout + "\n" + stderr).trim();
        
        if (error) {
          console.log(`❌ Tests failed!`);
          resolve({
            success: false,
            output: output
          });
        } else {
          console.log(`✅ Tests passed!`);
          resolve({
            success: true,
            output: output
          });
        }
      });
    });
  }
}

module.exports = new TestRunner();
