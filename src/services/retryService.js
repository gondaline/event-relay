import { findDeliveriesForRetry, findDeliveryById, updateDeliveryAfterRetry } from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js"
import isRetryable from "../utils/isRetryable.js";
import parseDeliveryId from "../utils/parseDeliveryId.js";
import sendWebhook from "./webhookService.js";

function permanentFailure(httpStatus) {
    return {
        status: "PERMANENT_FAILURE",
        httpStatus,
        message: "O destino respondeu com um erro que não permite nova tentativa"
    };
}

async function retryOneDelivery(delivery) {
    const endpointId = await findEndpointById(delivery.endpoint_id);

    const event = {
        "endpointId": delivery.endpoint_id,
        "type": delivery.event_type,
        "data": delivery.payload
    }

    const { status, httpStatus } = await sendWebhook(endpointId.url, event);

    await updateDeliveryAfterRetry(delivery.id, status, httpStatus);

    // No banco, a entrega continua FAILED. Esta resposta só avisa o Worker de que acabou.
    if (status === "FAILED" && !isRetryable(httpStatus)) {
        return permanentFailure(httpStatus);
    }

    return {
        status,
        httpStatus
    };
}


async function retryDeliveries() {
    const deliveries = await findDeliveriesForRetry();

    for (const delivery of deliveries) {
        await retryOneDelivery(delivery);
    }
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
        return permanentFailure(delivery.http_status);
    }

    return retryOneDelivery(delivery);
}

export { retryDeliveries, retryDeliveryById };