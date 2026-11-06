import { findDeliveryById, updateDeliveryAfterRetry } from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js"
import isRetryable from "../utils/isRetryable.js";
import parseDeliveryId from "../utils/parseDeliveryId.js";
import sendWebhook from "./webhookService.js";

function permanentFailure(httpStatus, message) {
    return {
        status: "PERMANENT_FAILURE",
        httpStatus,
        message
    };
}

async function retryOneDelivery(delivery) {
    const endpoint = await findEndpointById(delivery.endpoint_id);

    const event = {
        "endpointId": delivery.endpoint_id,
        "type": delivery.event_type,
        "data": delivery.payload
    }

    const { status, httpStatus, blocked } = await sendWebhook(endpoint.url, event);

    await updateDeliveryAfterRetry(delivery.id, status, httpStatus);

    // No banco, a entrega continua FAILED. Estas respostas só avisam o Worker de que acabou.
    if (blocked) {
        return permanentFailure(httpStatus, "A URL do endpoint aponta para um endereço não permitido, e o evento não foi enviado");
    }

    if (status === "FAILED" && !isRetryable(httpStatus)) {
        return permanentFailure(httpStatus, "O destino respondeu com um erro que não permite nova tentativa");
    }

    return {
        status,
        httpStatus
    };
}

async function retryDeliveryById(id) {
    const deliveryId = parseDeliveryId(id);
    const delivery = await findDeliveryById(deliveryId);

    if (!delivery) throw createHttpError(404, "Nenhum ID encontrado");
    
    if (delivery.status === "SUCCESS")
        return {
            status: "ALREADY_DELIVERED",
            message: "Webhook já entregue anteriormente"
        };

    if (delivery.attempts >= 8) {
        return {
            "status": "MAX_RETRIES_REACHED",
            "message": "Limite de tentativas atingido"
        };
    }

    // Se o último erro foi definitivo, não envia de novo, mesmo que a mensagem chegue repetida.
    if (delivery.status === "FAILED" && !isRetryable(delivery.http_status)) {
        return permanentFailure(delivery.http_status, "O destino respondeu com um erro que não permite nova tentativa");
    }

    return retryOneDelivery(delivery);
}

export default retryDeliveryById;