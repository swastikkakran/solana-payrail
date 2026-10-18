/** Just enough of the Solana wire format to read what the page asked the wallet to sign. */
import { getBase58Decoder } from '@solana/kit';

export interface DecodedInstruction {
    program: string;
    accounts: string[];
    data: Uint8Array;
}

export interface DecodedTransaction {
    signatures: Uint8Array[];
    /** Byte offset where the message starts (after the signature section). */
    messageOffset: number;
    accountKeys: string[];
    instructions: DecodedInstruction[];
}

function shortVec(bytes: Uint8Array, offset: number): [value: number, size: number] {
    let value = 0;
    let size = 0;
    for (;;) {
        const b = bytes[offset + size] ?? 0;
        value |= (b & 0x7f) << (7 * size);
        size++;
        if ((b & 0x80) === 0) return [value, size];
    }
}

export function decodeWireTransaction(tx: Uint8Array): DecodedTransaction {
    const b58 = getBase58Decoder();
    let o = 0;
    const [nsig, s1] = shortVec(tx, o);
    o += s1;
    const signatures: Uint8Array[] = [];
    for (let i = 0; i < nsig; i++) signatures.push(tx.slice(o + 64 * i, o + 64 * (i + 1)));
    o += 64 * nsig;
    const messageOffset = o;

    if ((tx[o] ?? 0) & 0x80) o++; // versioned message prefix
    o += 3; // header
    const [nkeys, s2] = shortVec(tx, o);
    o += s2;
    const accountKeys: string[] = [];
    for (let i = 0; i < nkeys; i++) accountKeys.push(b58.decode(tx.subarray(o + 32 * i, o + 32 * (i + 1))));
    o += 32 * nkeys + 32; // keys + recent blockhash

    const [nix, s3] = shortVec(tx, o);
    o += s3;
    const instructions: DecodedInstruction[] = [];
    for (let i = 0; i < nix; i++) {
        const programIndex = tx[o++] ?? 0;
        const [na, s4] = shortVec(tx, o);
        o += s4;
        const accounts = [...tx.subarray(o, o + na)].map(idx => accountKeys[idx] ?? '?');
        o += na;
        const [nd, s5] = shortVec(tx, o);
        o += s5;
        const data = tx.slice(o, o + nd);
        o += nd;
        instructions.push({ program: accountKeys[programIndex] ?? '?', accounts, data });
    }
    return { signatures, messageOffset, accountKeys, instructions };
}

export function sameBytes(a: Uint8Array, b: Uint8Array) {
    return a.length >= b.length && b.every((v, i) => a[i] === v);
}
