import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import pool from "../src/config/database.js";
import retryDelivery from "../src/controllers/retryController.js";
import deliverEvent from "../src/services/eventService.js";
import retryDeliveryById from "../src/services/retryService.js";
import isRetryable from "../src/utils/isRetryable.js";

const event = { endpointId: 2, type: "payment.approved", data: { orderId: 123, amount: 150 } };

const NO_RESPONSE = null;

const RETRYABLE = [408, 429, 500, 502, 503, 504, 599, NO_RESPONSE];
const DEFINITIVE = [301, 302, 400, 401, 403, 404, 405, 409, 410, 422];

let deliveries;
let destinationAnswers;
let destinationCalls;
let published;

function fakeQuery(sql, params) {
    if (sql.includes("FROM endpoints")) {
        return { rows: [{ id: 2, url: "http://destino.test/hook" }] };
    }
    if (sql.includes("INSERT INTO deliveries")) {
        const row = {
            id: deliveries.length + 1,
            endpoint_id: params[0],
            event_type: params[1],
            payload: params[2],
            status: params[3],
            http_status: params[4],
            attempts: 1
        };
        deliveries.push(row);
        return { rows: [{ id: row.id }] };
    }
    if (sql.includes("SELECT * FROM deliveries")) {
        const row = deliveries.find((delivery) => delivery.id === params[0]);
        return { rows: row ? [{ ...row }] : [] };
    }
    if (sql.includes("UPDATE deliveries")) {
        const row = deliveries.find((delivery) => delivery.id === params[2]);
        row.attempts += 1;
        row.status = params[0];
        row.http_status = params[1];
        return { rows: [{ ...row }], rowCount: 1 };
    }
    throw new Error(`Consulta inesperada: ${sql}`);
}

function fakeFetch(url, options) {
    if (url.startsWith("https://api.cloudflare.com/")) {
        published.push(JSON.parse(options.body).body.deliveryId);
        return Response.json({ success: true });
    }

    destinationCalls += 1;
    const answer = destinationAnswers.shift();
    if (answer === undefined) throw new Error("Envio inesperado ao destino");
    if (answer === NO_RESPONSE) throw new TypeError("fetch failed");

    return new Response(null, { status: answer });
}

function addDelivery(fields) {
    const row = {
        id: deliveries.length + 1,
        endpoint_id: 2,
        event_type: "payment.approved",
        payload: {},
        status: "FAILED",
        http_status: 500,
        attempts: 1,
        ...fields
    };
    deliveries.push(row);
    return row;
}

async function callRetryRoute(id) {
    const res = {
        set() {
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };

    await retryDelivery({ params: { id } }, res);
    return res;
}

beforeEach(() => {
    deliveries = [];
    destinationAnswers = [];
    destinationCalls = 0;
    published = [];

    // Libera o endereço falso do destino sem consultar o DNS.
    process.env.ALLOW_PRIVATE_URLS = "true";
    delete process.env.NODE_ENV;
    process.env.CLOUDFLARE_ACCOUNT_ID = "fake-account";
    process.env.CLOUDFLARE_QUEUE_ID = "fake-queue";
    process.env.CLOUDFLARE_API_TOKEN = "fake-token";

    mock.method(pool, "query", async (sql, params) => fakeQuery(sql, params));
    mock.method(globalThis, "fetch", async (url, options) => fakeFetch(url, options));
    mock.method(console, "error", () => {});
    mock.method(console, "log", () => {});
});

afterEach(() => {
    mock.restoreAll();
});

describe("isRetryable", () => {
    for (const httpStatus of RETRYABLE) {
        it(`${httpStatus} permite nova tentativa`, () => {
            assert.equal(isRetryable(httpStatus), true);
        });
    }

    for (const httpStatus of [...DEFINITIVE, 200, 201, 204, 499, 600]) {
        it(`${httpStatus} não permite nova tentativa`, () => {
            assert.equal(isRetryable(httpStatus), false);
        });
    }
});

describe("Primeira tentativa", () => {
    for (const httpStatus of RETRYABLE) {
        it(`${httpStatus} registra a falha e vai para a fila`, async () => {
            destinationAnswers = [httpStatus];

            assert.deepEqual(await deliverEvent(event), {
                deliveryId: 1,
                status: "FAILED",
                httpStatus,
                retryScheduled: true,
                blocked: false
            });
            assert.deepEqual(published, [1]);
            assert.equal(deliveries[0].status, "FAILED");
            assert.equal(deliveries[0].http_status, httpStatus);
        });
    }

    for (const httpStatus of DEFINITIVE) {
        it(`${httpStatus} registra a falha e não vai para a fila`, async () => {
            destinationAnswers = [httpStatus];

            assert.deepEqual(await deliverEvent(event), {
                deliveryId: 1,
                status: "FAILED",
                httpStatus,
                retryScheduled: false,
                blocked: false
            });
            assert.deepEqual(published, []);
            assert.equal(deliveries[0].status, "FAILED");
            assert.equal(deliveries[0].http_status, httpStatus);
        });
    }

    it("200 registra o sucesso e não vai para a fila", async () => {
        destinationAnswers = [200];

        assert.deepEqual(await deliverEvent(event), {
            deliveryId: 1,
            status: "SUCCESS",
            httpStatus: 200,
            retryScheduled: false,
            blocked: false
        });
        assert.deepEqual(published, []);
    });
});

describe("Retry", () => {
    for (const httpStatus of DEFINITIVE) {
        it(`${httpStatus} encerra o processamento e mantém o histórico`, async () => {
            addDelivery({});
            destinationAnswers = [httpStatus];

            const res = await callRetryRoute(1);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.status, "PERMANENT_FAILURE");
            assert.equal(res.body.httpStatus, httpStatus);
            assert.equal(deliveries[0].status, "FAILED");
            assert.equal(deliveries[0].http_status, httpStatus);
            assert.equal(deliveries[0].attempts, 2);
        });
    }

    for (const httpStatus of RETRYABLE) {
        it(`${httpStatus} pede outra tentativa ao Worker`, async () => {
            addDelivery({});
            destinationAnswers = [httpStatus];

            const res = await callRetryRoute(1);

            assert.equal(res.statusCode, 502);
            assert.deepEqual(res.body, {
                deliveryId: 1,
                status: "FAILED",
                httpStatus,
                message: "A entrega falhou e pode ser tentada novamente"
            });
            assert.equal(deliveries[0].http_status, httpStatus);
            assert.equal(deliveries[0].attempts, 2);
        });
    }

    it("200 conclui a entrega", async () => {
        addDelivery({});
        destinationAnswers = [200];

        const res = await callRetryRoute(1);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { deliveryId: 1, status: "SUCCESS", httpStatus: 200, message: "Evento entregue com sucesso" });
        assert.equal(deliveries[0].status, "SUCCESS");
        assert.equal(deliveries[0].attempts, 2);
    });
});

describe("Primeira tentativa 500 e segunda 404", () => {
    it("para no segundo envio e mantém FAILED, 404 e 2 tentativas", async () => {
        destinationAnswers = [500, 404];

        await deliverEvent(event);
        assert.deepEqual(published, [1]);

        const res = await callRetryRoute(1);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, "PERMANENT_FAILURE");
        assert.equal(destinationCalls, 2);
        assert.equal(deliveries[0].status, "FAILED");
        assert.equal(deliveries[0].http_status, 404);
        assert.equal(deliveries[0].attempts, 2);
    });

    it("não envia de novo se a mesma mensagem chegar repetida", async () => {
        destinationAnswers = [500, 404];

        await deliverEvent(event);
        await callRetryRoute(1);
        const res = await callRetryRoute(1);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, "PERMANENT_FAILURE");
        assert.equal(destinationCalls, 2);
        assert.equal(deliveries[0].attempts, 2);
    });
});

describe("Regras mantidas", () => {
    it("depois de um erro definitivo, a rota não envia de novo", async () => {
        addDelivery({ http_status: 404 });

        const res = await callRetryRoute(1);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, "PERMANENT_FAILURE");
        assert.equal(destinationCalls, 0);
        assert.equal(deliveries[0].attempts, 1);
    });

    it("destino sempre com 500 recebe exatamente 8 tentativas", async () => {
        destinationAnswers = Array(8).fill(500);

        await deliverEvent(event);
        for (let retry = 0; retry < 7; retry += 1) {
            assert.equal((await callRetryRoute(1)).statusCode, 502);
        }

        const res = await callRetryRoute(1);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, "MAX_RETRIES_REACHED");
        assert.equal(destinationCalls, 8);
        assert.equal(deliveries[0].attempts, 8);
    });

    it("sem novo envio ao atingir o limite, mesmo com erro definitivo", async () => {
        addDelivery({ http_status: 404, attempts: 8 });

        const res = await callRetryRoute(1);

        assert.equal(res.body.status, "MAX_RETRIES_REACHED");
        assert.equal(destinationCalls, 0);
    });

    it("entrega já concluída não é enviada de novo", async () => {
        addDelivery({ status: "SUCCESS", http_status: 200 });

        const res = await callRetryRoute(1);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, "ALREADY_DELIVERED");
        assert.equal(destinationCalls, 0);
    });

    it("falha sem resposta continua podendo tentar de novo até entregar", async () => {
        addDelivery({ http_status: NO_RESPONSE, attempts: 3 });
        destinationAnswers = [200];

        const res = await callRetryRoute(1);

        assert.equal(res.body.status, "SUCCESS");
        assert.equal(deliveries[0].attempts, 4);
    });
});
