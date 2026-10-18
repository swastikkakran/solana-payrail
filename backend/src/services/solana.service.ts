import { address, createSolanaRpc, signature } from "@solana/kit";
import { paymentModel } from "../models/payment-request.model.js";
import { confirmAndNotify } from "../services/webhook.service.js";
import { ApiError } from "../utils/api-error.js";
import { IMerchant } from "../models/merchant.model.js";


if (!process.env.SOLANA_RPC_URL) throw new ApiError(404, "solana devnet rpc not found!")
const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL);


const verifyTransaction = async function (
    merchant: IMerchant,
    sign: string
) {
    const tx = await rpc.getTransaction(signature(sign), {
        commitment: "confirmed",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
    }).send();

    if (!tx) {
        return {
            verified: false,
            reason: "tx failed or not found!",
        };
    }

    const accountKeys = tx.transaction.message.accountKeys.map(
        k => k.pubkey
    );

    // Check if payment exists in DB
    const payment = await paymentModel.findOne({
        merchant: merchant._id,
        status: "pending",
        expiresAt: { $gt: new Date() },
        reference: { $in: accountKeys },
    });

    if (!payment) {
        return {
            verified: false,
            reason: "no pending payment found!",
        };
    }

    // Check if recipient's address is in transaction
    const recipientIndex = accountKeys.indexOf(
        address(merchant.payoutWallet)
    );

    if (recipientIndex === -1) {
        return {
            verified: false,
            payment,
            reason: "Recipient not found in transaction",
        };
    }

    let payerWallet: string | undefined;

    // ============================================================
    // SOL PAYMENT
    // ============================================================

    if (payment.currency === "SOL") {
        const preBalance = tx.meta?.preBalances[recipientIndex];
        const postBalance = tx.meta?.postBalances[recipientIndex];

        if (
            preBalance === undefined ||
            postBalance === undefined
        ) {
            return {
                verified: false,
                payment,
                reason: "Unable to retrieve balance information",
            };
        }

        const amountReceivedBaseUnits =
            BigInt(postBalance) - BigInt(preBalance);

        if (
            amountReceivedBaseUnits !==
            BigInt(payment.amountBaseUnits)
        ) {
            return {
                verified: false,
                payment,
                reason: "Amount mismatch",
            };
        }

        const senderIndex =
            tx.meta?.preBalances?.findIndex(
                (bal, i) =>
                    bal >
                        (tx.meta?.postBalances?.[i] ?? 0) &&
                    i !== recipientIndex
            ) ?? -1;

        payerWallet =
            senderIndex >= 0
                ? accountKeys[senderIndex]
                : undefined;
    }

    // ============================================================
    // USDC PAYMENT
    // ============================================================

    else {
        const preTokenBalances =
            tx.meta?.preTokenBalances ?? [];

        const postTokenBalances =
            tx.meta?.postTokenBalances ?? [];

        const expectedMint =
            process.env.USDC_MINT_ADDRESS;

        if (!expectedMint) {
            return {
                verified: false,
                payment,
                reason: "USDC_MINT_ADDRESS is not configured",
            };
        }

        /*
         * Find the merchant's token account by looking at the
         * token balance owner.
         *
         * accountIndex refers to the token account, while
         * tokenAmount belongs to that token account.
         */
        const preTokenBalance =
            preTokenBalances.find(
                b =>
                    b.mint === expectedMint &&
                    b.owner === merchant.payoutWallet
            );

        const postTokenBalance =
            postTokenBalances.find(
                b =>
                    b.mint === expectedMint &&
                    b.owner === merchant.payoutWallet
            );

        if (!preTokenBalance || !postTokenBalance) {
            return {
                verified: false,
                payment,
                reason: "Merchant USDC token balance not found",
            };
        }

        // Make absolutely sure we're checking the expected mint.
        if (
            preTokenBalance.mint !== expectedMint ||
            postTokenBalance.mint !== expectedMint
        ) {
            return {
                verified: false,
                payment,
                reason: "Unexpected token mint",
            };
        }

        /*
         * IMPORTANT:
         *
         * uiTokenAmount.amount is the raw integer amount.
         *
         * Example:
         *
         * 1.25 USDC
         *
         * becomes:
         *
         * "1250000"
         *
         * because USDC has 6 decimals.
         *
         * We compare these raw integers directly.
         */
        const preAmount =
            BigInt(preTokenBalance.uiTokenAmount.amount);

        const postAmount =
            BigInt(postTokenBalance.uiTokenAmount.amount);

        const amountReceivedBaseUnits =
            postAmount - preAmount;

        if (
            amountReceivedBaseUnits !==
            BigInt(payment.amountBaseUnits)
        ) {
            return {
                verified: false,
                payment,
                reason: "Amount mismatch",
            };
        }

        /*
         * Try to determine the payer.
         *
         * For SPL transfers, the payer's token account is
         * different from the payer's wallet address.
         *
         * The token balance entry's owner gives us the wallet.
         */
        const senderTokenBalance =
            preTokenBalances.find(
                b =>
                    b.mint === expectedMint &&
                    b.owner &&
                    b.owner !== merchant.payoutWallet
            );

        payerWallet =
            senderTokenBalance?.owner;
    }

    return {
        verified: true,
        payment,
        payerWallet,
        transactionSignature: sign,
    };
};


const reconcilePendingPayments = async function (merchant: IMerchant) {
    
    const recipientPubkey = address(merchant.payoutWallet);
    const paymentSignatures = await rpc.getSignaturesForAddress(recipientPubkey, { limit: 50 }).send();

    for (const signObj of paymentSignatures) {
        if (!signObj.signature) continue;
        const result = await verifyTransaction(merchant, signObj.signature)

        if (result.verified && result.payment) {
            await confirmAndNotify(result, merchant)
        }
    }

    //all the timeout-ed tx will be declared expired.
    await paymentModel.updateMany(
        { merchant: merchant._id, status: "pending", expiresAt: { $lte: new Date() } },
        { status: "expired" }
    );
}

export { verifyTransaction, reconcilePendingPayments };