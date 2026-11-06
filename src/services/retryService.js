import { findDeliveriesForRetry, findDeliveryById, updateDeliveryAfterRetry } from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js"
import sendWebhook from "./webhookService.js";

async function retryOneDelivery(delivery) {
    const endpointId = await findEndpointById(delivery.endpoint_id);

    const event = {
        "endpointId": delivery.endpoint_id,
        "type": delivery.event_type,
        "data": delivery.payload
    }

    const { status, httpStatus } = await sendWebhook(endpointId.url, event);

    await updateDeliveryAfterRetry(delivery.id, status, httpStatus);

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
    const delivery = await findDeliveryById(id);

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

    return retryOneDelivery(delivery);
}

export { retryDeliveries, retryDeliveryById };