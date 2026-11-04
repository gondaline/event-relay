import express from "express";
import eventRoutes from "./routes/eventRoutes.js"
import endpointRoutes from "./routes/endpointRoutes.js"

const app = express();
const PORT = 3000;
app.use(express.json());

app.use("/events", eventRoutes)
app.use("/endpoints", endpointRoutes)

app.listen(PORT, () => {
    console.log(`EventRelay rodando na porta ${PORT}`);
})