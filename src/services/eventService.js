import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js";

async function deliverEvent(event) {

    if (!event?.endpointId) throw createHttpError(400, "O campo endpointId é obrigatório e deve ser maior que zero");
    const endpointId = event.endpointId;
    if (!Number.isInteger(endpointId)) throw createHttpError(400, "O campo endpointId deve ser um número inteiro");
    if (endpointId < 0 || endpointId > 2147483647) throw createHttpError(400, "O campo endpointId deve estar entre 1 e 2147483647");

    const endpoint = await findEndpointById(endpointId)
    if (!endpoint) throw createHttpError(404, "Endpoint não encontrado. Cadastre um em POST /endpoints");

    try {
        const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(event)
        });

        return response;
    } catch (error) {
        throw createHttpError(502, "Não foi possível conectar ao destino do evento")
    }
}

export default deliverEvent;