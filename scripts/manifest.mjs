import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const data=await readFile(new URL('../web/data/values.f64',import.meta.url));
await writeFile(new URL('../web/data/manifest.json',import.meta.url),JSON.stringify({
  format:'little-endian-float64',ruleset:'hasbro-forced-joker-v1',entries:1048576,
  bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),
  initialEV:data.readDoubleLE(0),generator:'solver/solve.cpp',
  index:'((filledMask * 64 + min(upperSubtotal, 63)) * 2) + yahtzeeBonusArmed',
},null,2)+'\n');
