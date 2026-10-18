import { ApiError } from "../utils/api-error.js";
import { generateApiKey, generateSecretKey, encrypt } from "../utils/crypto.js";
import { merchantModel, IMerchant } from "../models/merchant.model.js";
import { paymentModel } from "../models/payment-request.model.js";
import bcrypt from "bcrypt";
import { disconnectMerchant } from "../watcher/connection-manager.js";
import { fetchMerchantAccount } from "../onchain/merchant-registry.js";


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

    merchant.previousCredentials!.apiKey = merchant.apiKey;
    merchant.previousCredentials!.apiSecretHash = merchant.apiSecretHash;
    merchant.previousCredentials!.expiresAt = new Date(Date.now() + (1000*60*60*24))

    const newApiKey = generateApiKey()
    const newApiSecret = generateSecretKey()
    const newApiSecretHash = await bcrypt.hash(newApiSecret, 10);

    merchant.apiKey = newApiKey;
    merchant.apiSecretHash = newApiSecretHash
    await merchant.save()

    return { newApiKey, newApiSecret }
}


const deleteMerchantService = async function (merchant: IMerchant) {
    
    const pendingPayments = await paymentModel.findOne({ merchant: merchant._id, status: "pending" })
    if (pendingPayments) throw new ApiError(400, "Pending payment for an order! Cannot perform account deletion.")

    await disconnectMerchant(merchant._id)
    const deletedForm = await merchantModel.findByIdAndDelete(merchant._id)
    return deletedForm
}

export { registerService, keyRotationService, deleteMerchantService }