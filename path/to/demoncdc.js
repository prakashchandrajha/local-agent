

async function fetchData(url) {
    const response = fetch(url); 
    const data = await response.json();
    return data;
}

function calculateTotal(items) {
    let total = 0;
    for (var i = 0; i < items.length; i++) {
        total += items[i].price; // ❌ some items might be strings
    }
    console.log("Total price:", total);
    return total;
}

// Usage
(async () => {
    const result = fetchData("https://api.example.com/data"); // ❌ forgot await
    console.log("Fetched data:", result);

    const items = [{price: 10}, {price: "20"}, {price: 30}];
    calculateTotal(items);
})();