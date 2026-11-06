import express from "express";
import getDeliveryById from "../controllers/deliveriesController.js";
import retryDelivery from "../controllers/retryController.js";

const router = express.Router();

router.get("/:id", getDeliveryById);
router.post("/:id/retry", retryDelivery);

export default router;
