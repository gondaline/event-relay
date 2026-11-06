import deliverEvent from "../services/eventService.js";
import isRetryable from "../utils/isRetryable.js";

function describeResult({ deliveryId, status, httpStatus, retryScheduled }) {
    if (status === "SUCCESS") {
        return { code: 200, message: "Evento entregue com sucesso" };
    }

    if (retryScheduled) {
        return { code: 202, message: "A entrega falhou, e uma nova tentativa automática foi agendada" };
    }

    if (isRetryable(httpStatus)) {
        return {
            code: 502,
            message: `Evento registrado, mas a nova tentativa automática não foi agendada. Use POST /deliveries/${deliveryId}/retry para tentar novamente`
        };
    }

    return { code: 502, message: "O destino respondeu com um erro que não permite nova tentativa" };
}

async function sendEvent(req, res) {
    try {
        const result = await deliverEvent(req.body);
        const { code, message } = describeResult(result);

        return res.status(code).json({ ...result, message });

    } catch (error) {
        console.error("Erro ao enviar evento:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }
}

export default sendEvent;