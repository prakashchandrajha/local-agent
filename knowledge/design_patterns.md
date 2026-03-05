# Design Patterns

## Singleton Pattern

Ensure only one instance of a class exists for shared resources:

```javascript
class Database {
  static instance = null;
  
  static getInstance() {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }
}
```

## Factory Pattern

Create objects without specifying exact class:

```javascript
function createCalculator(type) {
  if (type === 'basic') return new BasicCalculator();
  if (type === 'scientific') return new ScientificCalculator();
  throw new Error('Unknown calculator type');
}
```

## Module Pattern

Encapsulate code in modules:

```javascript
const Calculator = (function() {
  let memory = 0;
  
  return {
    add: (x) => memory += x,
    clear: () => memory = 0,
    getMemory: () => memory
  };
})();
```

## Observer Pattern

Notify dependents of state changes:

```javascript
class Subject {
  constructor() {
    this.observers = [];
  }
  
  subscribe(fn) {
    this.observers.push(fn);
  }
  
  notify(data) {
    this.observers.forEach(fn => fn(data));
  }
}
```
