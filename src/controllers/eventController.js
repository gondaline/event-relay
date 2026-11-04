import deliverEvent from "../services/eventService.js";

async function sendEvent(req, res) {
    try {
        const result = await deliverEvent(req.body)

        if (result.httpStatus === null) {
            return res.status(502).json({ message: "Não foi possível conectar ao destino, que pode estar offline" });

        } else if (result.status !== "SUCCESS") {
            return res.status(502).json({ message: "O destino respondeu com erro ao receber o evento" });
        }

        res.status(200).json({ message: "Evento entregue com sucesso" });

    } catch (error) {
        console.error("Erro ao enviar evento:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }
}

export default sendEvent;