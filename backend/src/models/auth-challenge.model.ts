import mongoose, { Document } from "mongoose";

export interface IAuthChallenge extends Document {
    walletAddress: string;
    message: string;
    nonce: string;
    expiresAt: Date;
}

const authChallengeSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    message: {
        type: String,
        required: true,
    },
    nonce: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
}, { timestamps: true });


authChallengeSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

export const authChallengeModel =
    mongoose.model<IAuthChallenge>("auth_challenge", authChallengeSchema);