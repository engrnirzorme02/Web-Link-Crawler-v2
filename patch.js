const fs = require('fs');
const file = 'src/lib/firebase.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace('export interface Session {\n  id?: string;', 'export interface Session {\n  id?: string;\n  settings?: any;');
fs.writeFileSync(file, code);
