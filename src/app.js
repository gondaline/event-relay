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

// No Express 5, um erro ao abrir a porta chega neste callback, e não como exceção.
app.listen(PORT, (error) => {
    if (error) {
        console.error(`Não foi possível iniciar o EventRelay na porta ${PORT}:`, error.message);
        process.exit(1);
    }

    console.log(`EventRelay rodando na porta ${PORT}`);
})