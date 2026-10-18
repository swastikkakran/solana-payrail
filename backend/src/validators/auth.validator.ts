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

export { registerMerchantSchema };
export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;