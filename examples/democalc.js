// Usage: node democalc.js add 2 3
const { add } = require('./calculator');

function parseArguments(args) {
    if (args.length !== 4) {
        throw new Error('Usage: node democalc.js add <num1> <num2>');
    }
    const [, , operation, num1, num2] = args;
    return { operation, num1: parseFloat(num1), num2: parseFloat(num2) };
}

function main() {
    try {
        const { operation, num1, num2 } = parseArguments(process.argv);
        switch (operation) {
            case 'add':
                console.log(`Result: ${add(num1, num2)}`);
                break;
            default:
                throw new Error('Invalid operation');
        }
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

main();