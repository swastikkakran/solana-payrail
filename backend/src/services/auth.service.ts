import { ApiError } from "../utils/api-error.js";
import { generateApiKey, generateSecretKey, encrypt } from "../utils/crypto.js";
import { merchantModel, IMerchant } from "../models/merchant.model.js";
import { paymentModel } from "../models/payment-request.model.js";
import bcrypt from "bcrypt";
import { disconnectMerchant } from "../watcher/connection-manager.js";
import { fetchMerchantAccount } from "../onchain/merchant-registry.js";
import { address, getBase64Encoder, getPublicKeyFromAddress, getUtf8Encoder, signatureBytes, verifySignature } from "@solana/kit";
import { authChallengeModel } from "../models/auth-challenge.model.js";
import { sessionModel } from "../models/session.model.js";
import { generateNonce, generateSessionToken, hashToken } from "../utils/crypto.js";


const registerService = async function (name: string, email: string, webhookUrl: string, payoutWallet: string) {
    
    const existingUser = await merchantModel.findOne({ email: email });
    if (existingUser) throw new ApiError(409, "Email already exists!");

    const merchant = await fetchMerchantAccount(payoutWallet);
    if (!merchant) {
        throw new ApiError(
            400,
            "Merchant wallet is not registered on-chain."
        );
    }

    const apiKey = generateApiKey()
    const apiSecret = generateSecretKey()
    const webhookSecret = generateSecretKey()

    const apiSecretHash = await bcrypt.hash(apiSecret, 10);
    const { ciphertext, iv, authTag } = encrypt(webhookSecret);

    const user = await merchantModel.create({
        name: name,
        email: email,
        apiKey: apiKey,
        apiSecretHash: apiSecretHash,
        webhookUrl: webhookUrl,
        webhookEncryption: {
            encryptedWebhookSecret: ciphertext,
            iv: iv,
            authTag: authTag
        },
        payoutWallet: payoutWallet
    })

    const registerPayload = { apiKey, apiSecret, webhookSecret }
    return registerPayload;
}


const keyRotationService = async function (merchant: IMerchant) {

    merchant.previousCredentials = {
        apiKey: merchant.apiKey,
        apiSecretHash: merchant.apiSecretHash,
        expiresAt: new Date(Date.now() + (1000 * 60 * 60 * 24))
    };

    const newApiKey = generateApiKey();
    const newApiSecret = generateSecretKey();
    const newApiSecretHash = await bcrypt.hash(newApiSecret, 10);

    merchant.apiKey = newApiKey;
    merchant.apiSecretHash = newApiSecretHash;

    await merchant.save();

    return { newApiKey, newApiSecret };
};


const deleteMerchantService = async function (merchant: IMerchant) {
    
    const pendingPayments = await paymentModel.findOne({ merchant: merchant._id, status: "pending" })
    if (pendingPayments) throw new ApiError(400, "Pending payment for an order! Cannot perform account deletion.")

    await disconnectMerchant(merchant._id)
    const deletedForm = await merchantModel.findByIdAndDelete(merchant._id)
    return deletedForm
}

const createWalletChallengeService = async function (walletAddress: string) {
    try {
        address(walletAddress);
    } catch {
        throw new ApiError(400, "Invalid Solana wallet address");
    }

    const merchant = await merchantModel.findOne({
        payoutWallet: walletAddress,
    });

    if (!merchant) {
        throw new ApiError(
            404,
            "No Payrail merchant account exists for this wallet."
        );
    }

    const nonce = generateNonce();

    const issuedAt = new Date();
    const expiresAt = new Date(
        issuedAt.getTime() + 5 * 60 * 1000
    );

    const appUrl =
        process.env.PAYRAIL_APP_URL ||
        "http://localhost:5173";

    const message = [
        "Payrail wants you to sign in.",
        "",
        `Domain: ${appUrl}`,
        `Wallet: ${walletAddress}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expiration Time: ${expiresAt.toISOString()}`,
        "",
        "This signature will not create a blockchain transaction or cost SOL.",
    ].join("\n");

    await authChallengeModel.findOneAndUpdate(
        { walletAddress },
        {
            walletAddress,
            message,
            nonce,
            expiresAt,
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );

    return {
        walletAddress,
        message,
        expiresAt,
    };
};


const verifyWalletChallengeService = async function (
    walletAddress: string,
    encodedSignature: string
) {
    try {
        address(walletAddress);
    } catch {
        throw new ApiError(400, "Invalid Solana wallet address");
    }

    const merchant = await merchantModel.findOne({
        payoutWallet: walletAddress,
    });

    if (!merchant) {
        throw new ApiError(
            404,
            "No Payrail merchant account exists for this wallet."
        );
    }

    const challenge = await authChallengeModel.findOne({
        walletAddress,
    });

    if (!challenge) {
        throw new ApiError(
            401,
            "No active authentication challenge found."
        );
    }

    if (challenge.expiresAt <= new Date()) {
        await authChallengeModel.deleteOne({
            _id: challenge._id,
        });

        throw new ApiError(
            401,
            "Authentication challenge has expired."
        );
    }

    let verified = false;

    try {
        const publicKey = await getPublicKeyFromAddress(
            address(walletAddress)
        );

        const signature = signatureBytes(
            getBase64Encoder().encode(encodedSignature)
        );

        const message = getUtf8Encoder().encode(
            challenge.message
        );

        verified = await verifySignature(
            publicKey,
            signature,
            message
        );
    } catch {
        verified = false;
    }

    if (!verified) {
        throw new ApiError(
            401,
            "Invalid wallet signature."
        );
    }

    // Consume the challenge immediately.
    // This prevents replaying the same signed message.
    await authChallengeModel.deleteOne({
        _id: challenge._id,
    });

    // Invalidate previous dashboard sessions for this merchant.
    await sessionModel.deleteMany({
        merchant: merchant._id,
    });

    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);

    const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    await sessionModel.create({
        merchant: merchant._id,
        tokenHash,
        expiresAt,
    });

    return {
        sessionToken,
        expiresAt,
        merchant: {
            id: merchant._id,
            walletAddress: merchant.payoutWallet,
            name: merchant.name,
            email: merchant.email,
        },
    };
};


const logoutWalletService = async function (
    sessionToken: string
) {
    const tokenHash = hashToken(sessionToken);

    await sessionModel.deleteOne({
        tokenHash,
    });
};

const getCurrentMerchantService = async function (sessionToken: string) {
    const tokenHash = hashToken(sessionToken);

    const session = await sessionModel
        .findOne({ tokenHash })
        .populate<{ merchant: IMerchant }>("merchant");

    if (!session) {
        throw new ApiError(401, "Invalid session");
    }

    if (session.expiresAt <= new Date()) {
        await sessionModel.deleteOne({
            _id: session._id,
        });

        throw new ApiError(401, "Session expired");
    }

    if (!session.merchant) {
        throw new ApiError(401, "Merchant account not found");
    }

    return {
        id: session.merchant._id,
        walletAddress: session.merchant.payoutWallet,
        name: session.merchant.name,
        email: session.merchant.email,
        expiresAt: session.expiresAt,
    };
};

export {
    registerService,
    keyRotationService,
    deleteMerchantService,
    createWalletChallengeService,
    verifyWalletChallengeService,
    logoutWalletService,
    getCurrentMerchantService,
};