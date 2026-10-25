const fs = require('fs');
let content = fs.readFileSync('packages/adapter-react-router/test/responses.test.ts', 'utf8');
content = content.replace(/expect\(err\.data\)/g, 'expect(err.data)'); // wait, wait... err.data doesn't exist anymore!
// ah wait, I renamed `data` to `errorData` inside ErrorResponse! Let's check ErrorResponse interface in `responses.ts`.
