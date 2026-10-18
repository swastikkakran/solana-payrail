import { Router } from "express";
import { createPaymentController, fetchSinglePaymentController, fetchAllPaymentsController } from "../controllers/payment.controller.js";
import { normalApiMiddleware } from "../middlewares/auth.middleware.js";
import { validateObjectId, createPaymentSchema } from "../validators/payment.validator.js";
import { validateRequest } from "../middlewares/validate.middleware.js";


const router = Router();

router.route("/")
    .post(
        normalApiMiddleware,
        validateRequest(createPaymentSchema),
        createPaymentController
    )
    .get(normalApiMiddleware, fetchAllPaymentsController);

router.route("/:paymentId").get(normalApiMiddleware, validateObjectId("paymentId"), fetchSinglePaymentController);

export default router;