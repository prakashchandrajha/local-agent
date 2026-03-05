# Calculator App

This is a simple command-line calculator application written in Python. It allows users to perform basic arithmetic operations like addition, subtraction, multiplication and division.

## Usage

1. Run the script using python interpreter.
2. Enter two numbers when prompted.
3. Choose an operation (+ for addition, - for subtraction, * for multiplication, / for division).
4. The result will be displayed on the console.

def add(x, y):
    return x + y

def subtract(x, y):
    return x - y

def multiply(x, y):
    return x * y

def divide(x, y):
    if y != 0:
        return x / y
    else:
        return "Error! Division by zero is not allowed."

print("Select operation.")
print("1.Add")
print("2.Subtract")
print("3.Multiply")
print("4.Divide")

while True:
    choice = input("Enter choice(1/2/3/4): ")

    if choice in ('1', '2', '3', '4'):
        num1 = float(input("Enter first number: "))
        num2 = float(input("Enter second number: "))

        if choice == '1':
            print(num1, "+", num2, "=", add(num1, num2))

        elif choice == '2':
            print(num1, "-", num2, "=", subtract(num1, num2))

        elif choice == '3':
            print(num1, "*", num2, "=", multiply(num1, num2))

        elif choice == '4':
            result = divide(num1, num2)
            if isinstance(result, str):
                print(result)
            else:
                print(num1, "/", num2, "=", result)
    break