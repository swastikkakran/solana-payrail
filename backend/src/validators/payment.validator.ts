import mongoose from "mongoose";
import { z } from "zod";
import { ApiError } from "../utils/api-error.js";
import { Request, Response, NextFunction } from "express";

const validateObjectId =
    (paramName: string) =>
    (req: Request, res: Response, next: NextFunction) => {
        const id = req.params[paramName] as string;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, `Invalid ${paramName}`);
        }

        next();
    };

const createPaymentSchema = z.object({
    amount: z
        .number()
        .finite()
        .positive("amount must be greater than zero")
        .max(1_000_000, "amount is too large"),

    currency: z.enum(["SOL", "USDC"]),

    label: z
        .string()
        .trim()
        .max(100, "label must be 100 characters or fewer")
        .optional(),

    message: z
        .string()
        .trim()
        .max(500, "message must be 500 characters or fewer")
        .optional(),
});

export { validateObjectId, createPaymentSchema };

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;