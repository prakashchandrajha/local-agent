---
"use strict";

/**
 * Function to add two numbers
 * @param {number} a - The first number.
 * @param {number} b - The second number.
 * @returns {number} The sum of the two numbers.
 */
function add(a, b)  {
    if (typeof a !== 'number' || typeof b !== 'number') throw new Error('Both inputs must be numbers');
    return a + b;
}

/**
 * Function to subtract one number from another
 * @param {number} a - The number to be subtracted from.
 * @param {number} b - The number to subtract.
 * @returns {number} The result of the subtraction.
 */
function subtract(a, b)  {
    if (typeof a !== 'number' || typeof b !== 'number') throw new Error('Both inputs must be numbers');
    return a - b;
}

/**
 * Function to multiply two numbers
 * @param {number} a - The first number.
 * @param {number} b - The second number.
 * @returns {number} The product of the two numbers.
 */
function multiply(a, b)  {
    if (typeof a !== 'number' || typeof b !== 'number') throw new Error('Both inputs must be numbers');
    return a * b;
}

/**
 * Function to divide one number by another
 * @param {number} a - The number to be divided.
 * @param {number} b - The number to divide by.
 * @returns {number} The result of the division.
 */
function divide(a, b)  {
    if (typeof a !== 'number' || typeof b !== 'number') throw new Error('Both inputs must be numbers');
    
    if (b === 0)  {
        throw new Error('Division by zero is not allowed');
    } else  {
        return a / b;
    }
}
---