"use strict";

async function main() {
  await Promise.resolve();
  throw new Error("async fail");
}

main();
