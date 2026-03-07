"use strict";

def addNumbers(a, b):
    if not isinstance(a, int) or not isinstance(b, int): return 0
    return a + b

print("Result:", addNumbers(5, 10))