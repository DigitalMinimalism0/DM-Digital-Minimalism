import { checks } from './checks.mjs';
console.log('READ ONLY deployment verification.');
process.exitCode = (await checks({ deployment: true })) ? 1 : 0;
