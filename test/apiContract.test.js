import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import express from "express";

import pool from "../src/config/database.js";
import { errorHandler, notFoundHandler } from "../src/middlewares/errorHandler.js";
import deliveriesRoutes from "../src/routes/deliveriesRoutes.js";
import endpointRoutes from "../src/routes/endpointRoutes.js";
import eventRoutes from "../src/routes/eventRoutes.js";

const realFetch = globalThis.fetch;
const event = { endpointId: 2, type: "payment.approved", data: { orderId: 123, amount: 150 } };
const DESTINATION_URL = "http://destino.test/hook";

describe("Contrato HTTP da API", () => {
    let server;
    let baseUrl;
    let deliveries;
    let destinationStatus;

    function fakeQuery(sql, params) {
        if (sql.includes("INSERT INTO endpoints")) return { rows: [{ id: 9, name: params[0], url: params[1] }] };
        if (sql.includes("FROM endpoints WHERE url")) return { rows: params[0] === DESTINATION_URL ? [{ id: 2 }] : [] };
        if (sql.includes("FROM endpoints WHERE id")) return { rows: params[0] === 2 ? [{ id: 2, url: DESTINATION_URL }] : [] };
        if (sql.includes("SELECT * FROM deliveries")) {
            const row = deliveries.find((delivery) => delivery.id === params[0]);
            return { rows: row ? [{ ...row }] : [] };
        }
        if (sql.includes("UPDATE deliveries")) {
            const row = deliveries.find((delivery) => delivery.id === params[2]);
            row.attempts += 1;
            row.status = params[0];
            row.http_status = params[1];
            return { rows: [] };
        }
        throw new Error(`Consulta inesperada: ${sql}`);
    }

    async function fakeFetch(url, options) {
        if (url.startsWith(baseUrl)) return realFetch(url, options);
        return new Response(null, { status: destinationStatus });
    }

    async function request(method, path, { body, raw } = {}) {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: raw ?? (body && JSON.stringify(body))
        });
        return { status: response.status, type: response.headers.get("content-type"), body: await response.json() };
    }

    function addDelivery(fields) {
        deliveries.push({
            id: 7,
            endpoint_id: 2,
            event_type: "payment.approved",
            payload: { orderId: 123 },
            status: "FAILED",
            http_status: 500,
            attempts: 1,
            created_at: new Date("2026-11-06T12:00:00.000Z"),
            ...fields
        });
    }

    before(async () => {
        const app = express();
        app.use(express.json());
        app.use("/events", eventRoutes);
        app.use("/endpoints", endpointRoutes);
        app.use("/deliveries", deliveriesRoutes);
        app.use(notFoundHandler);
        app.use(errorHandler);

        await new Promise((resolve) => {
            server = app.listen(0, "127.0.0.1", resolve);
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => {
        server.closeAllConnections();
        server.close();
    });

    beforeEach(() => {
        deliveries = [];
        destinationStatus = 200;

        // Libera o endereço falso do destino sem consultar o DNS.
        process.env.ALLOW_PRIVATE_URLS = "true";
        delete process.env.NODE_ENV;

        mock.method(pool, "query", async (sql, params) => fakeQuery(sql, params));
        mock.method(globalThis, "fetch", fakeFetch);
        mock.method(console, "error", () => {});
        mock.method(console, "log", () => {});
    });

    afterEach(() => {
        mock.restoreAll();
    });

    describe("recursos", () => {
        it("GET /deliveries/:id usa os mesmos nomes de campos da API, não os do banco", async () => {
            addDelivery({});

            const { status, body } = await request("GET", "/deliveries/7");

            assert.equal(status, 200);
            assert.deepEqual(body, {
                deliveryId: 7,
                endpointId: 2,
                type: "payment.approved",
                data: { orderId: 123 },
                status: "FAILED",
                httpStatus: 500,
                attempts: 1,
                createdAt: "2026-11-06T12:00:00.000Z"
            });
        });

        it("POST /endpoints responde 201 com endpointId, name e url", async () => {
            const { status, body } = await request("POST", "/endpoints", { body: { name: "Destino", url: "http://destino.test/novo" } });

            assert.equal(status, 201);
            assert.deepEqual(body, { endpointId: 9, name: "Destino", url: "http://destino.test/novo" });
        });
    });

    describe("POST /deliveries/:id/retry", () => {
        const outcomes = [
            {
                label: "entregue",
                row: {},
                destination: 200,
                http: 200,
                status: "SUCCESS",
                httpStatus: 200,
                message: "Evento entregue com sucesso"
            },
            {
                label: "falha temporária",
                row: {},
                destination: 503,
                http: 502,
                status: "FAILED",
                httpStatus: 503,
                message: "A entrega falhou e pode ser tentada novamente"
            },
            {
                label: "erro definitivo do destino",
                row: {},
                destination: 404,
                http: 200,
                status: "PERMANENT_FAILURE",
                httpStatus: 404,
                message: "O destino não aceitou o evento, e esse resultado não permite nova tentativa"
            },
            {
                label: "erro definitivo já registrado",
                row: { http_status: 410 },
                destination: 200,
                http: 200,
                status: "PERMANENT_FAILURE",
                httpStatus: 410,
                message: "O destino não aceitou o evento, e esse resultado não permite nova tentativa"
            },
            {
                label: "já entregue",
                row: { status: "SUCCESS", http_status: 200 },
                destination: 200,
                http: 200,
                status: "ALREADY_DELIVERED",
                httpStatus: 200,
                message: "Evento já entregue anteriormente"
            },
            {
                label: "limite atingido",
                row: { attempts: 8 },
                destination: 200,
                http: 200,
                status: "MAX_RETRIES_REACHED",
                httpStatus: 500,
                message: "Limite de tentativas atingido"
            }
        ];

        for (const { label, row, destination, http, status, httpStatus, message } of outcomes) {
            it(`${label}: responde ${http} com deliveryId, status, httpStatus e message`, async () => {
                addDelivery(row);
                destinationStatus = destination;

                const response = await request("POST", "/deliveries/7/retry");

                assert.equal(response.status, http);
                assert.deepEqual(response.body, { deliveryId: 7, status, httpStatus, message });
            });
        }
    });

    describe("erros esperados", () => {
        const expectedErrors = [
            ["POST /events sem os campos", "POST", "/events", { body: {} }, 400],
            ["POST /events com endpointId zero", "POST", "/events", { body: { ...event, endpointId: 0 } }, 400],
            ["POST /events com endpointId negativo", "POST", "/events", { body: { ...event, endpointId: -1 } }, 400],
            ["POST /events com endpoint inexistente", "POST", "/events", { body: { ...event, endpointId: 999 } }, 404],
            ["POST /endpoints com URL inválida", "POST", "/endpoints", { body: { name: "x", url: "not a url" } }, 400],
            ["POST /endpoints com URL duplicada", "POST", "/endpoints", { body: { name: "x", url: DESTINATION_URL } }, 409],
            ["GET /deliveries com ID inválido", "GET", "/deliveries/abc", {}, 400],
            ["GET /deliveries inexistente", "GET", "/deliveries/999", {}, 404],
            ["retry com ID inválido", "POST", "/deliveries/abc/retry", {}, 400],
            ["retry inexistente", "POST", "/deliveries/999/retry", {}, 404],
            ["rota inexistente", "GET", "/nao-existe", {}, 404],
            ["JSON malformado", "POST", "/events", { raw: "{ not json" }, 400]
        ];

        for (const [label, method, path, options, expected] of expectedErrors) {
            it(`${label}: responde ${expected} só com message, em JSON e sem log de erro`, async () => {
                const { status, type, body } = await request(method, path, options);

                assert.equal(status, expected);
                assert.match(type, /application\/json/);
                assert.deepEqual(Object.keys(body), ["message"]);
                assert.equal(console.error.mock.callCount(), 0);
            });
        }

        it("entrega inexistente tem a mesma mensagem no GET e no retry", async () => {
            const found = await request("GET", "/deliveries/999");
            const retried = await request("POST", "/deliveries/999/retry");

            assert.equal(found.body.message, "Entrega não encontrada");
            assert.equal(retried.body.message, found.body.message);
        });
    });

    describe("erros inesperados", () => {
        const routes = [
            ["POST /events", "POST", "/events", { body: event }],
            ["POST /endpoints", "POST", "/endpoints", { body: { name: "x", url: "http://destino.test/outro" } }],
            ["GET /deliveries/:id", "GET", "/deliveries/7", {}],
            ["POST /deliveries/:id/retry", "POST", "/deliveries/7/retry", {}]
        ];

        for (const [label, method, path, options] of routes) {
            it(`${label}: responde 500 genérico e registra o erro`, async () => {
                pool.query.mock.mockImplementation(async () => {
                    throw new Error('password authentication failed for user "segredo"');
                });

                const { status, body } = await request(method, path, options);

                assert.equal(status, 500);
                assert.deepEqual(body, { message: "Erro interno do servidor" });
                assert.equal(console.error.mock.callCount(), 1);
            });
        }
    });
});
