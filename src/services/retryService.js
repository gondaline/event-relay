import { findDeliveriesForRetry, updateDeliveryAfterRetry } from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";

async function retryDeliveries() {
    const deliveries = await findDeliveriesForRetry();

    for (const delivery of deliveries) {

        let status = "FAILED";
        let httpStatus = null;
        const endpointId = await findEndpointById(delivery.endpoint_id);

        const event = {
            "endpointId": delivery.endpoint_id,
            "type": delivery.event_type,
            "data": delivery.payload
        }

        try {
            const response = await fetch(endpointId.url, {
                signal: AbortSignal.timeout(5000),
                method: 'POST',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(event)
            })

            if (response.ok) status = "SUCCESS"

            httpStatus = response.status;

        } catch (error) {
            console.error("Erro ao reenviar evento", error);
        }

        await updateDeliveryAfterRetry(delivery.id, status, httpStatus);
    }
}

export default retryDeliveries;