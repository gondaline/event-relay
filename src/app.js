import express from "express";

import eventRoutes from "./routes/eventRoutes.js"
import endpointRoutes from "./routes/endpointRoutes.js"
import deliveriesRoutes from "./routes/deliveriesRoutes.js"

import workerAuth from "./middlewares/workerAuth.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

const app = express();
const PORT = 3000;

app.use(workerAuth)
app.use(express.json());

app.use("/events", eventRoutes)
app.use("/endpoints", endpointRoutes)
app.use("/deliveries", deliveriesRoutes)

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`EventRelay rodando na porta ${PORT}`);
})