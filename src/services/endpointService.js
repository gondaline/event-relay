import { insertEndpoint, findEndpointByUrl } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js";
import normalizeAndValidateUrl from "../utils/normalizeAndValidateUrl.js"
import isSafeUrl from "../utils/isSafeUrl.js";

async function registerEndpoint(name, url) {

    if (typeof name !== "string" || typeof url !== "string") throw createHttpError(400, "Os campos name e url devem ser textos");
    if (name.trim() === "" || url.trim() === "") throw createHttpError(400, "Os campos name e url não podem estar vazios");
    if (name.length > 100) throw createHttpError(400, "O campo name deve ter no máximo 100 caracteres");
    if (url.length > 2048) throw createHttpError(400, "O campo url deve ter no máximo 2048 caracteres");

    const normalizedUrl = normalizeAndValidateUrl(url);
    if (!normalizedUrl) throw createHttpError(400, "O campo url deve ser uma URL válida");
    if (!await isSafeUrl(normalizedUrl)) throw createHttpError(400, "O campo url aponta para um endereço não permitido ou que não pôde ser verificado");

    const existingEndpoint = await findEndpointByUrl(normalizedUrl);
    if (existingEndpoint) throw createHttpError(409, "Já existe um endpoint cadastrado com essa URL")

    const endpoint = await insertEndpoint(name, normalizedUrl);

    return { endpointId: endpoint.id, name: endpoint.name, url: endpoint.url };
}

export default registerEndpoint;