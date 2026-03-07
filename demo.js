const fs = require("fs").promises;
const path = require('path');

class TaskProcessor {
    constructor(filePath) {
        this.filePath = filePath;
        this.tasks = [];
    }

    async loadTasks() {
        if (!(await fs.stat(this.filePath).catch(() => false))) {
            throw new Error('File not found');
        }
        
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
                if (task.type === "math") {
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
        
        if (typeof payload.divider !== 'number' || payload.divider === 0) {
            throw new Error('Invalid divider');
        }

        return result / payload.divider;
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

    try {
      await processor.loadTasks();
    } catch (error) {
      console.log(`Error: ${error.message}`);
      return;
    }
    
    const results = await processor.processTasks();

    console.log("Results:", results);
}

run();