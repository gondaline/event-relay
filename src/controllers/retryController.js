import { retryDeliveryById } from "../services/retryService.js";

async function retryDelivery(req, res) {

    // Avisa o Worker de que esta resposta veio mesmo da rota de retry da API.
    res.set("X-EventRelay-Retry-Handled", "true");

    const id = req.params.id;

    try {
        const response = await retryDeliveryById(id);

        if (response.status === "FAILED") {
            return res.status(502).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        if (!error.status) console.error("Erro ao reenviar entrega:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        })
    }
}

export default retryDelivery;