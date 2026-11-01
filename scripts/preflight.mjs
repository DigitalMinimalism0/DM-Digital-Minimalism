import { checks, depDir, cfg } from './checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
console.log('READ ONLY. No signatures, transactions, key reads or broadcasts.');
let failures = await checks({ requireSigner: process.argv.includes('--signer') });
if (existsSync(join(depDir, `${cfg.chainId}.json`)) && !process.argv.includes('--allow-existing')) {
  console.log('FAIL existing deployment; refuse accidental redeployment');
  failures++;
}
process.exitCode = failures ? 1 : 0;
