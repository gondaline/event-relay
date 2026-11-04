import deliverEvent from "../services/eventService.js";

async function sendEvent(req, res) {
    try {
        const response = await deliverEvent(req.body)

        if (!response.ok) {
            console.log(`O destino respondeu com status ${response.status}`);
            return res.status(502).json({ message: "O destino respondeu com erro ao receber o evento" });
        }

        res.status(200).json({ message: "Evento entregue com sucesso!" });

    } catch (error) {
        console.error("Erro ao enviar evento:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }
}

export default sendEvent;