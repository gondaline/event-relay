import getDeliveryByIdService from "../services/deliveryService.js"

async function getDeliveryById(req, res) {
    const id = req.params.id;

    try {
        const delivery = await getDeliveryByIdService(id);
        return res.status(200).json(delivery);
    } catch (error) {
        if (!error.status) console.error("Erro ao consultar entrega:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }

}

export default getDeliveryById;