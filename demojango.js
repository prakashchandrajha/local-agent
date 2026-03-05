// Usage: node demojango.js
const fs = require('fs');

function convertMarkdownToJS(filename) {
  const mdFileContent = fs.readFileSync(filename, 'utf8');
  
  // Convert Markdown to HTML using some markdown library
  const html = marked(mdFileContent);

  // Convert HTML to JavaScript comments
  const jsComments = htmlToJsComments(html);

  return jsComments;
}

function htmlToJsComments(html) {
  let jsComments = '';
  
  // Split the HTML into lines and convert each line to a JS comment
  html.split('\n').forEach((line) => {
    if (line.trim() !== '') {
      jsComments += `// ${line}\n`;
    } else {
      jsComments += '\n';
    }
  });
  
  return jsComments;
}

console.log(convertMarkdownToJS('demojango.md'));