import { Router } from "express";
import { registerController, keyRotationController, deleteMerchantController, walletChallengeController, walletVerifyController, walletLogoutController, currentMerchantController } from "../controllers/auth.controller.js";
import { strictApiMiddleware } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { registerMerchantSchema, walletChallengeSchema, walletVerifySchema } from "../validators/auth.validator.js";


const router = Router();

router.route("/register").post(validateRequest(registerMerchantSchema), registerController);
router.route("/rotate").post(strictApiMiddleware, keyRotationController);
router.route("/").delete(strictApiMiddleware, deleteMerchantController);
router.route("/challenge").post(validateRequest(walletChallengeSchema), walletChallengeController);
router.route("/verify").post(validateRequest(walletVerifySchema), walletVerifyController);
router.route("/logout").post(walletLogoutController);
router.route("/me").get(currentMerchantController);


export default router;