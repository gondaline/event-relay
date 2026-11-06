import deliverEvent from "../services/eventService.js";
import isRetryable from "../utils/isRetryable.js";

function describeResult({ deliveryId, status, httpStatus, retryScheduled, blocked }) {
    if (status === "SUCCESS") {
        return { code: 200, message: "Evento entregue com sucesso" };
    }

    // 422 porque o problema está na URL cadastrada: nenhum serviço externo foi chamado.
    if (blocked) {
        return { code: 422, message: "A URL do endpoint aponta para um endereço não permitido, e o evento não foi enviado" };
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
        const { blocked, ...body } = result;

        return res.status(code).json({ ...body, message });

    } catch (error) {
        console.error("Erro ao enviar evento:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }
}

export default sendEvent;