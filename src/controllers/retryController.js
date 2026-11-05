import { retryDeliveryById } from "../services/retryService.js";

async function retryDelivery(req, res) {

    const id = req.params.id;

    try {
        const response = await retryDeliveryById(id);

        if (response.status === "FAILED") {
            return res.status(502).json(response);
        }

        return res.status(200).json(response);
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        })
    }
}

export default retryDelivery;