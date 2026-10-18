import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { registerService, keyRotationService, deleteMerchantService, createWalletChallengeService, verifyWalletChallengeService, logoutWalletService, getCurrentMerchantService } from "../services/auth.service.js";


const registerController = asyncHandler(async function (req, res) {
    
    const { name, email, webhookUrl, payoutWallet } = req.body;
    const registerPayload = await registerService(name, email, webhookUrl, payoutWallet)

    res
        .status(201)
        .json(new ApiResponse(201, registerPayload, "merchant registered successfully!"))
})


const keyRotationController = asyncHandler(async function (req, res) {
    
    const merchant = req.merchant;
    const newKeys = await keyRotationService(merchant!)

    res
        .status(201)
        .json(new ApiResponse(201, newKeys, "keys rotated successfully!"))
})


const deleteMerchantController = asyncHandler(async function (req, res) {
    
    const merchant = req.merchant;
    const deletedMerchant = await deleteMerchantService(merchant!);

    res
        .status(200)
        .json(new ApiResponse(200, deletedMerchant, "merchant deleted successfully!"))
})

const walletChallengeController = asyncHandler(async function (req, res) {
    const { walletAddress } = req.body;

    const challenge =
        await createWalletChallengeService(walletAddress);

    res
        .status(200)
        .json(
            new ApiResponse(
                200,
                challenge,
                "authentication challenge created"
            )
        );
});


const walletVerifyController = asyncHandler(async function (req, res) {
    const {
        walletAddress,
        signature,
    } = req.body;

    const result =
        await verifyWalletChallengeService(
            walletAddress,
            signature
        );

    res
        .cookie(
            "payrail_session",
            result.sessionToken,
            {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                expires: result.expiresAt,
                path: "/",
            }
        )
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    merchant: result.merchant,
                    expiresAt: result.expiresAt,
                },
                "wallet authenticated successfully"
            )
        );
});


const walletLogoutController = asyncHandler(async function (req, res) {
    const cookies = req.headers.cookie;

    const sessionCookie = cookies
        ?.split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith("payrail_session="));

    if (sessionCookie) {
        const sessionToken = decodeURIComponent(
            sessionCookie.slice("payrail_session=".length)
        );

        await logoutWalletService(sessionToken);
    }

    res
        .clearCookie("payrail_session", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        })
        .status(200)
        .json(
            new ApiResponse(
                200,
                null,
                "logged out successfully"
            )
        );
});

const currentMerchantController = asyncHandler(async function (req, res) {
        const cookies = req.headers.cookie;

        const sessionCookie = cookies
            ?.split(";")
            .map((cookie) => cookie.trim())
            .find((cookie) =>
                cookie.startsWith("payrail_session=")
            );

        if (!sessionCookie) {
            throw new ApiError(401, "Not authenticated");
        }

        const sessionToken = decodeURIComponent(
            sessionCookie.slice("payrail_session=".length)
        );

        const merchant =
            await getCurrentMerchantService(sessionToken);

        res.status(200).json(
            new ApiResponse(
                200,
                merchant,
                "authenticated merchant retrieved successfully"
            )
        );
    }
);


export {
    registerController,
    keyRotationController,
    deleteMerchantController,
    walletChallengeController,
    walletVerifyController,
    walletLogoutController,
    currentMerchantController
};