const fs = require('fs').promises;

// existing content of the file
let content = '';

function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8')
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
}

// modify this path to your file location
const filePath = './src/client';

readFile(filePath)
  .then(data => {
    content = data;
    console.log('File read successfully');
    
    // write the modified content back to the same file
    fs.writeFile(filePath, content, err => {
      if (err) throw err;
      console.log('File written successfully');
      
      // create output.txt and store the content of the file
      fs.writeFile('./output.txt', content, err => {
        if (err) throw err;
        console.log('Output file written successfully');
      });
    });
  })
  .catch(err => console.error(`Error reading file: ${err}`));