function divide(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments must be numbers');
  }
  
  // Check for division by zero
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  
  return a / b;
}

module.exports = { divide };