const Calculator = {
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
    multiply: (a, b) => a * b,
    divide: (a, b) => b !== 0 ? a / b : 'Error! Division by zero is not allowed.',
};

console.log(Calculator.add(5, 3)); // Outputs: 8
console.log(Calculator.subtract(5, 3)); // Outputs: 2
console.log(Calculator.multiply(5, 3)); // Outputs: 15
console.log(Calculator.divide(6, 3)); // Outputs: 2
console.log(Calculator.divide(6, 0)); // Outputs: 'Error! Division by zero is not allowed.'