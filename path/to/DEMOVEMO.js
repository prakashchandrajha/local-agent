"use strict";
class Calculator {
    add(a, b) {
        try {
            return a + b;
        } catch (error) {
            throw error;
        }
    }
  
    subtract(a, b) {
        try {
            return a - b;
        } catch (error) {
            throw error;
        }
    }
  
    multiply(a, b) {
        try {
            return a * b;
        } catch (error) {
            throw error;
        }
    }
  
    divide(a, b) {
        if  (b != 0) {
            return a / b;
        } else {
            throw "Division by zero is not allowed.";
        }
    }
}