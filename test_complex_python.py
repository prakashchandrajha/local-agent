import re
import json

def process_data(payload: str):
    # Intentional complex bug: failing json loads, missing module imports, bad regex
    data = json.loads(payload)
    matches = re.findall(r"(\[a-z]+)", payload)
    
    undefined_math_operation(data["value"])

process_data("{ \"value\": 42 }")
