import { z } from "zod";
import { address } from "@solana/kit";

const registerMerchantSchema = z.object({
    name: z
        .string()
        .trim()
        .max(100, "name must be 100 characters or fewer")
        .optional(),
    email: z
        .string()
        .email("Invalid email address"),

    webhookUrl: z
        .string()
        .url("webhookUrl must be a valid URL")
        .startsWith("https://", "webhookUrl must use HTTPS"),

    payoutWallet: z
        .string()
        .refine((val) => {
            try {
                address(val);
                return true;
            } catch {
                return false;
            }
        }, "payoutWallet must be a valid Solana address")
});

const walletChallengeSchema = z.object({
    walletAddress: z
        .string()
        .refine((val) => {
            try {
                address(val);
                return true;
            } catch {
                return false;
            }
        }, "walletAddress must be a valid Solana address"),
});

const walletVerifySchema = z.object({
    walletAddress: z
        .string()
        .refine((val) => {
            try {
                address(val);
                return true;
            } catch {
                return false;
            }
        }, "walletAddress must be a valid Solana address"),

    signature: z
        .string()
        .min(1, "signature is required"),
});

export { registerMerchantSchema, walletChallengeSchema, walletVerifySchema };

export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;
export type WalletChallengeInput = z.infer<typeof walletChallengeSchema>;
export type WalletVerifyInput = z.infer<typeof walletVerifySchema>;