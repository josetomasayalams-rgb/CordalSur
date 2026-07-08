import fs from 'fs';
const html = fs.readFileSync('check-in.html','utf8');
// Extract the inline anti-flash script
const m = html.match(/<script>(function\(\)\{[\s\S]*?\}\)\(\);<\/script>/);
console.log('inline:', m ? m[0] : 'NOT FOUND');
const t = fs.readFileSync('js/theme.js','utf8');
const rm = t.match(/function readTheme\(\) \{([\s\S]*?)\n  \}/);
console.log('---readTheme---');
console.log(rm ? rm[0] : 'NOT FOUND');
