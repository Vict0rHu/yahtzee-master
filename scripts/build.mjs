import {cp,mkdir,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('web/data/manifest.json','utf8'));
const table=await readFile('web/data/values.f64');
if(table.length!==manifest.bytes||createHash('sha256').update(table).digest('hex')!==manifest.sha256)throw new Error('Value table integrity check failed.');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
await cp('web','dist',{recursive:true});
for(const file of ['LICENSE','README.md'])await cp(file,`dist/${file}`);
console.log(`Built static site: ${manifest.bytes.toLocaleString()}-byte verified value table; initial EV ${manifest.initialEV}.`);
