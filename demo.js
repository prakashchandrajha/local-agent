const fs = require("fs").promises;

class TaskProcessor {
    constructor(filePath) {
        this.filePath = filePath;
        this.tasks = [];
    }

    async loadTasks() {
        const data = await fs.readFile(this.filePath, "utf-8");
        this.tasks = JSON.parse(data);
    }

    async processTasks() {
        let results = [];

        for (let task of this.tasks) {
            const result = await this.executeTask(task);
            results.push(result);
        }

        return results;
    }

    async executeTask(task) {
        return new Promise((resolve, reject) => {

            setTimeout(() => {

                // ERROR 1 (Logic Error)
                if (task.type = "math") {

                    const value = this.performMath(task.payload);
                    resolve(value);

                } else if (task.type === "string") {

                    const value = this.performString(task.payload);
                    resolve(value);

                } else {
                    reject(new Error("Unknown task type"));
                }

            }, task.delay);

        });
    }

    performMath(payload) {

        let result = payload.numbers.reduce((acc, num) => {
            return acc + num;
        });

        // ERROR 2 (Runtime Error)
        return result / payload.divider.value;
    }

    performString(payload) {

        return payload.text
            .split("")
            .reverse()
            .join("")
            .toUpperCase();
    }
}

async function run() {

    const processor = new TaskProcessor("./tasks.json");

    await processor.loadTasks();

    const results = await processor.processTasks();

    console.log("Results:", results);

}

run();