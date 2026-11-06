import express from "express";
import sendEvent from "../controllers/eventController.js";

const router = express.Router();

router.post("/", sendEvent);

export default router;
