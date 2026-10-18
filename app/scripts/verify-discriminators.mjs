// Checks the hand-encoded Anchor discriminators in src/solana/merchantRegistry.ts against
// sha256("global:<ix>") / sha256("account:<Type>"). No dependencies: `node scripts/verify-discriminators.mjs`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/solana/merchantRegistry.ts', import.meta.url), 'utf8');
const expected = {
    INITIALIZE_DISCRIMINATOR: 'global:initialize',
    UPDATE_DISCRIMINATOR: 'global:update',
    MERCHANT_ACCOUNT_DISCRIMINATOR: 'account:Merchant',
};

let failed = false;
for (const [constant, preimage] of Object.entries(expected)) {
    const match = new RegExp(`${constant} = new Uint8Array\\(\\[([^\\]]+)\\]\\)`).exec(source);
    const inSource = match?.[1].split(',').map(s => Number(s.trim()));
    const actual = [...createHash('sha256').update(preimage).digest().subarray(0, 8)];
    const ok = JSON.stringify(inSource) === JSON.stringify(actual);
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${constant} = sha256("${preimage}")[0..8] = [${actual.join(', ')}]`);
}
process.exit(failed ? 1 : 0);
