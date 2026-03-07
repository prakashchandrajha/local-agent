"use strict";

function divide(a, b) {
  return a / b;
}

const result = divide(10, 0);

if (!Number.isFinite(result)) {
  throw new Error("division by zero");
}

console.log(result);
