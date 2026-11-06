import express from "express";
import createEndpoint from "../controllers/endpointController.js";

const router = express.Router();

router.post("/", createEndpoint);

export default router;
