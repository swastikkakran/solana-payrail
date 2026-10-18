import mongoose, { Document, Types } from "mongoose";

export interface ISession extends Document {
    merchant: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
}

const sessionSchema = new mongoose.Schema({
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "merchant",
        required: true,
        index: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
}, { timestamps: true });

sessionSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

export const sessionModel =
    mongoose.model<ISession>("session", sessionSchema);