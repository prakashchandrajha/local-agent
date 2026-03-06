// use strict
const express = require('express');
const app = express();
app.use(express.json());

let count = 0;

app.get('/', (req, res) => {
  count++;
  res.send({ message: `Hello World! This is visit number ${count}.` });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));