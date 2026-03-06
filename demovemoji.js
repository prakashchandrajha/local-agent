function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}

function multiply(a, b) {
    return a * b;
}

function divide(a, b) {
    if (b != 0) {
        return a / b;
    } else {
        console.log("Error: Division by zero is not allowed.");
        return null;
    }
}

// Example usage:
console.log(add(5, 3)); // Outputs: 8
console.log(subtract(5, 3)); // Outputs: 2
console.log(multiply(5, 3)); // Outputs: 15
console.log(divide(6, 3)); // Outputs: 2