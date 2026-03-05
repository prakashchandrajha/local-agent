# JavaScript Best Practices

## Error Handling

Always check denominator before division:
```javascript
if (b === 0) throw new Error("Division by zero");
```

## Variable Declarations

Use const/let instead of var:
```javascript
const PI = 3.14159;
let count = 0;
```

## Function Validation

Always validate input parameters:
```javascript
function calculate(a, b) {
  if (typeof a !== 'number') throw new Error('a must be a number');
  if (typeof b !== 'number') throw new Error('b must be a number');
}
```

## Null Checks

Always check for null/undefined before accessing properties:
```javascript
if (obj === null || obj === undefined) {
  throw new Error('Object is null or undefined');
}
```

## Async/Error Handling

Always use try-catch with async operations:
```javascript
try {
  const result = await asyncOperation();
} catch (error) {
  console.error('Operation failed:', error.message);
  throw error;
}
```
