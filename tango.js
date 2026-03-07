function calculate(operation, a, b) {
  switch (operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      if(b != 0) 
        return a / b;
      else
        return "Error: Division by zero is not allowed";
    default:
      return "Error: Invalid operation";
  }
}

console.log('Addition of 5 and 3: ' + calculate('add', 5, 3)); // Outputs: Addition of 5 and 3: 8
console.log('Subtraction of 5 from 3: ' + calculate('subtract', 5, 3)); // Outputs: Subtraction of 5 from 3: 2
console.log('Multiplication of 5 and 3: ' + calculate('multiply', 5, 3)); // Outputs: Multiplication of 5 and 3: 15
console.log('Division of 6 by 3: ' + calculate('divide', 6, 3)); // Outputs: Division of 6 by 3: 2
console.log(calculate('divide', 6, 0)); // Outputs: Error: Division by zero is not allowed