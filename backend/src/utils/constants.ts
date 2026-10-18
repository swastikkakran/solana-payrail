import BigNumber from "bignumber.js";

export const DECIMALS = {
    SOL: 9,
    USDC: 6,
} as const;

export const WSOL =
    "So11111111111111111111111111111111111111112";

export const toBaseUnits = (
    amount: number,
    currency: "SOL" | "USDC"
): bigint => {
    const decimals = DECIMALS[currency];

    return BigInt(
        new BigNumber(amount)
            .times(10 ** decimals)
            .integerValue(BigNumber.ROUND_HALF_UP)
            .toFixed(0)
    );
};

export const mintFor = (
    currency: "SOL" | "USDC"
): string => {
    if (currency === "SOL") {
        return WSOL;
    }

    if (!process.env.USDC_MINT_ADDRESS) {
        throw new Error("USDC_MINT_ADDRESS is not configured");
    }

    return process.env.USDC_MINT_ADDRESS;
};