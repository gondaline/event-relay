import e from "express";
import createDelivery from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js";

async function deliverEvent(event) {

    if (!event?.endpointId) throw createHttpError(400, "O campo endpointId é obrigatório e deve ser maior que zero");

    const endpointId = event.endpointId;
    if (!Number.isInteger(endpointId)) throw createHttpError(400, "O campo endpointId deve ser um número inteiro");
    if (endpointId < 0 || endpointId > 2147483647) throw createHttpError(400, "O campo endpointId deve estar entre 1 e 2147483647");

    if (typeof event.type !== "string") throw createHttpError(400, "O campo type deve ser um texto");
    if (event.type.trim() === "") throw createHttpError(400, "O campo type não pode estar vazio");
    if (event.type.length > 200) throw createHttpError(400, "O campo type deve ter no máximo 200 caracteres");

    if (typeof event.data !== "object" || event.data === null || Array.isArray(event.data)) throw createHttpError(400, "O campo data deve ser um objeto");

    const endpoint = await findEndpointById(endpointId)
    if (!endpoint) throw createHttpError(404, "Endpoint não encontrado. Cadastre um em POST /endpoints");

    let status = "FAILED";
    let httpStatus = null;

    try {
        const response = await fetch(endpoint.url, {
            signal: AbortSignal.timeout(5000),
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(event)
        });

        if (response.ok) status = "SUCCESS";

        httpStatus = response.status;

    } catch (error) {
        console.error("Erro ao conectar ao destino:", error);
    }

    await createDelivery({
        "endpoint_id": event.endpointId,
        "event_type": event.type,
        "payload": event.data,
        "status": status,
        "http_status": httpStatus
    })

    return { status, httpStatus }

}

export default deliverEvent;