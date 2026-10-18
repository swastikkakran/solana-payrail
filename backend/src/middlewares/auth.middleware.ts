import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { merchantModel } from "../models/merchant.model.js";
import { sessionModel } from "../models/session.model.js";
import { hashToken } from "../utils/crypto.js";
import bcrypt from "bcrypt";
import { IMerchant } from "../models/merchant.model.js";


const checkCredentials = async function (apiKey: string | string[]) {
    
    const existingMerchant = await merchantModel.findOne({ apiKey: apiKey })
    return existingMerchant;
}

const normalApiMiddleware = asyncHandler(async function (req, res, next) {
    
    const { 'x-api-key': apiKey, 'x-api-secret': apiSecret } = req.headers;
    if (!apiKey || !apiSecret) {
        throw new ApiError(401, "Missing API Key or Secret Header");
    }

    const existingMerchant = await checkCredentials(apiKey)

    if (!existingMerchant) {
        const tryPreviousCredentials = await merchantModel.findOne({ "previousCredentials.apiKey": apiKey })
        if (!tryPreviousCredentials) throw new ApiError(401, "Unauthorized access!")
        if (tryPreviousCredentials.previousCredentials!.expiresAt < new Date()) throw new ApiError(401, "Unauthorized access!")

        const tryPreviousSecret = await bcrypt.compare(apiSecret as string, tryPreviousCredentials.previousCredentials!.apiSecretHash)
        if (!tryPreviousSecret) throw new ApiError(401, "Unauthorized access!")
        
        req.merchant = tryPreviousCredentials
    }
    else {
        const isApiSecretValid = await bcrypt.compare(apiSecret as string, existingMerchant.apiSecretHash)
        if (!isApiSecretValid) throw new ApiError(401, "Unauthorized access!")
        req.merchant = existingMerchant
        }

    next()
})

const strictApiMiddleware = asyncHandler(async function (req, res, next) {
    
    const { 'x-api-key': apiKey, 'x-api-secret': apiSecret } = req.headers;
    if (!apiKey || !apiSecret) {
        throw new ApiError(401, "Missing API Key or Secret Header");
    }

    const existingMerchant = await checkCredentials(apiKey)
    if (!existingMerchant) throw new ApiError(401, "Unauthorized access!")
    const isApiSecretValid = await bcrypt.compare(apiSecret as string, existingMerchant.apiSecretHash)
    if (!isApiSecretValid) throw new ApiError(401, "Unauthorized access!")

    req.merchant = existingMerchant
    next()
})

const walletSessionMiddleware = asyncHandler(async function (req, res, next) {
    const cookies = req.headers.cookie;

    if (!cookies) {
        throw new ApiError(401, "Not authenticated");
    }

    const sessionCookie = cookies
        .split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith("payrail_session="));

    if (!sessionCookie) {
        throw new ApiError(401, "Not authenticated");
    }

    const sessionToken = decodeURIComponent(
        sessionCookie.slice("payrail_session=".length)
    );

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

    req.merchant = session.merchant;

    next();
});

export { normalApiMiddleware, strictApiMiddleware, walletSessionMiddleware }