const fs = require('fs');

function main() {
  const data = "hello world";
  console.log(data);
  if (true) {
    console.log("missing bracket");
  }
}
main();