export const DECIMALS = { SOL: 9, USDC: 6 } as const;
export const WSOL = "So11111111111111111111111111111111111111112";
export const toBaseUnits = (amount: number, c: "SOL" | "USDC") => BigInt(Math.round(amount * 10 ** DECIMALS[c]));
export const mintFor = (c: "SOL" | "USDC") => (c === "SOL" ? WSOL : process.env.USDC_MINT_ADDRESS!);