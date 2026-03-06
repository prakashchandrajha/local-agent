const fs = require('fs');
function main() {
  const data = "hello world";
  console.log(data); // Fixed typo in variable name and missing close bracket
  if (true) {
    console.log("missing bracket");
  }
}
main();