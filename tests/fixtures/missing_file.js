"use strict";

const fs = require("fs");

// Should trigger ENOENT
fs.readFileSync("nonexistent.json", "utf8");
