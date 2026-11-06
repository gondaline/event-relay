import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { inspect } from "node:util";

import express from "express";

import pool from "../src/config/database.js";
import deliveriesRoutes from "../src/routes/deliveriesRoutes.js";
import eventRoutes from "../src/routes/eventRoutes.js";

const event = { endpointId: 2, type: "payment.approved", data: { orderId: 123, amount: 150 } };
const NO_RESPONSE = null;
const realFetch = globalThis.fetch;

describe("POST /events", () => {
    let server;
    let baseUrl;
    let deliveries;
    let destinationAnswers;
    let cloudflareAnswer;
    let publishCalls;

    // "Tabela" em memória: nenhum teste acessa o banco, a rede ou a Cloudflare de verdade.
    function fakeQuery(sql, params) {
        if (sql.includes("FROM endpoints")) {
            return { rows: params[0] === 2 ? [{ id: 2, url: "http://destino.test/hook" }] : [] };
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

    async function fakeFetch(url, options) {
        if (url.startsWith(baseUrl)) return realFetch(url, options);

        if (url.startsWith("https://api.cloudflare.com/")) {
            publishCalls.push(options);
            return cloudflareAnswer();
        }

        const answer = destinationAnswers.shift();
        if (answer === undefined) throw new Error("Envio inesperado ao destino");
        if (answer === NO_RESPONSE) throw new TypeError("fetch failed");

        return new Response(null, { status: answer });
    }

    async function request(method, path, body) {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body && JSON.stringify(body)
        });
        return { status: response.status, type: response.headers.get("content-type"), body: await response.json() };
    }

    function errorLogs() {
        return console.error.mock.calls.map((call) => call.arguments.map((argument) => inspect(argument)).join(" ")).join("\n");
    }

    before(async () => {
        const app = express();
        app.use(express.json());
        app.use("/events", eventRoutes);
        app.use("/deliveries", deliveriesRoutes);

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
        destinationAnswers = [];
        publishCalls = [];
        cloudflareAnswer = () => Response.json({ success: true });

        // Libera o endereço falso do destino sem consultar o DNS.
        process.env.ALLOW_PRIVATE_URLS = "true";
        delete process.env.NODE_ENV;
        process.env.CLOUDFLARE_ACCOUNT_ID = "fake-account";
        process.env.CLOUDFLARE_QUEUE_ID = "fake-queue";
        process.env.CLOUDFLARE_API_TOKEN = "fake-cloudflare-token";

        mock.method(pool, "query", async (sql, params) => fakeQuery(sql, params));
        mock.method(globalThis, "fetch", fakeFetch);
        mock.method(console, "error", () => {});
        mock.method(console, "log", () => {});
    });

    afterEach(() => {
        mock.restoreAll();
    });

    describe("entrega bem-sucedida", () => {
        it("responde 200 com o deliveryId e não usa a fila", async () => {
            destinationAnswers = [200];

            const { status, body } = await request("POST", "/events", event);

            assert.equal(status, 200);
            assert.deepEqual(body, {
                deliveryId: 1,
                status: "SUCCESS",
                httpStatus: 200,
                retryScheduled: false,
                message: "Evento entregue com sucesso"
            });
            assert.equal(publishCalls.length, 0);
        });
    });

    describe("retry agendado", () => {
        for (const httpStatus of [408, 429, 500, 503, NO_RESPONSE]) {
            it(`${httpStatus}: responde 202 e publica o deliveryId na fila`, async () => {
                destinationAnswers = [httpStatus];

                const { status, body } = await request("POST", "/events", event);

                assert.equal(status, 202);
                assert.deepEqual(body, {
                    deliveryId: 1,
                    status: "FAILED",
                    httpStatus,
                    retryScheduled: true,
                    message: "A entrega falhou, e uma nova tentativa automática foi agendada"
                });
                assert.equal(publishCalls.length, 1);
                assert.deepEqual(JSON.parse(publishCalls[0].body).body, { deliveryId: 1 });
            });
        }

        it("publica com um limite de tempo", async () => {
            destinationAnswers = [500];

            await request("POST", "/events", event);

            assert.ok(publishCalls[0].signal instanceof AbortSignal);
        });
    });

    describe("erro definitivo do destino", () => {
        for (const httpStatus of [302, 400, 401, 403, 404, 410, 422]) {
            it(`${httpStatus}: responde 502, sem fila e sem sugerir nova tentativa`, async () => {
                destinationAnswers = [httpStatus];

                const { status, body } = await request("POST", "/events", event);

                assert.equal(status, 502);
                assert.deepEqual(body, {
                    deliveryId: 1,
                    status: "FAILED",
                    httpStatus,
                    retryScheduled: false,
                    message: "O destino respondeu com um erro que não permite nova tentativa"
                });
                assert.equal(publishCalls.length, 0);
            });
        }
    });

    describe("falha ao publicar na fila", () => {
        const failures = [
            ["Cloudflare responde 500", () => Response.json({ success: false }, { status: 500 })],
            ["Cloudflare responde 403", () => Response.json({ success: false }, { status: 403 })],
            ["Cloudflare responde 200 com success false", () => Response.json({ success: false })],
            ["Cloudflare responde uma página HTML", () => new Response("<html>Erro</html>", { status: 502 })],
            ["falha de rede", () => { throw new TypeError("fetch failed"); }],
            ["limite de tempo atingido", () => { throw new DOMException("The operation timed out", "TimeoutError"); }]
        ];

        for (const [label, answer] of failures) {
            describe(label, () => {
                beforeEach(() => {
                    cloudflareAnswer = answer;
                    destinationAnswers = [500];
                });

                it("responde 502 em JSON, sem afirmar que a mensagem entrou na fila", async () => {
                    const { status, type, body } = await request("POST", "/events", event);

                    assert.equal(status, 502);
                    assert.match(type, /application\/json/);
                    assert.deepEqual(body, {
                        deliveryId: 1,
                        status: "FAILED",
                        httpStatus: 500,
                        retryScheduled: false,
                        message: "Evento registrado, mas a nova tentativa automática não foi agendada. Use POST /deliveries/1/retry para tentar novamente"
                    });
                });

                it("preserva a entrega no banco", async () => {
                    await request("POST", "/events", event);

                    assert.equal(deliveries.length, 1);
                    assert.equal(deliveries[0].status, "FAILED");
                    assert.equal(deliveries[0].http_status, 500);
                    assert.equal(deliveries[0].attempts, 1);
                });

                it("registra o deliveryId no log, sem expor o token", async () => {
                    await request("POST", "/events", event);

                    const logs = errorLogs();
                    assert.match(logs, /Falha ao publicar a entrega 1 na fila/);
                    assert.equal(logs.includes("fake-cloudflare-token"), false);
                });

                it("permite a recuperação manual pela rota de retry", async () => {
                    await request("POST", "/events", event);
                    destinationAnswers = [200];

                    const { status, body } = await request("POST", "/deliveries/1/retry");

                    assert.equal(status, 200);
                    assert.equal(body.status, "SUCCESS");
                    assert.equal(deliveries[0].status, "SUCCESS");
                    assert.equal(deliveries[0].attempts, 2);
                });
            });
        }

        it("informa o código HTTP da Cloudflare no log", async () => {
            cloudflareAnswer = () => new Response("<html>Erro</html>", { status: 403 });
            destinationAnswers = [500];

            await request("POST", "/events", event);

            const logs = errorLogs();
            assert.match(logs, /HTTP 403/);
            assert.equal(logs.includes("<html>"), false);
        });
    });

    describe("formato da resposta", () => {
        it("traz os mesmos campos em todos os resultados", async () => {
            const scenarios = [
                [200, () => Response.json({ success: true })],
                [500, () => Response.json({ success: true })],
                [404, () => Response.json({ success: true })],
                [500, () => Response.json({ success: false })]
            ];

            for (const [destinationStatus, answer] of scenarios) {
                destinationAnswers = [destinationStatus];
                cloudflareAnswer = answer;

                const { body } = await request("POST", "/events", event);

                assert.deepEqual(Object.keys(body), ["deliveryId", "status", "httpStatus", "retryScheduled", "message"]);
            }
        });

        it("o deliveryId encontra a mesma entrega em GET /deliveries/:id", async () => {
            destinationAnswers = [200, 200];
            await request("POST", "/events", event);

            const { body } = await request("POST", "/events", event);
            const found = await request("GET", `/deliveries/${body.deliveryId}`);

            assert.equal(body.deliveryId, 2);
            assert.equal(found.status, 200);
            assert.equal(found.body.id, 2);
        });
    });

    describe("erros antes da entrega continuam iguais", () => {
        it("corpo inválido responde 400, sem deliveryId e sem usar o destino", async () => {
            const { status, body } = await request("POST", "/events", { type: "t", data: {} });

            assert.equal(status, 400);
            assert.deepEqual(Object.keys(body), ["message"]);
            assert.equal(deliveries.length, 0);
        });

        it("endpoint inexistente responde 404", async () => {
            const { status, body } = await request("POST", "/events", { ...event, endpointId: 999 });

            assert.equal(status, 404);
            assert.deepEqual(Object.keys(body), ["message"]);
        });

        it("falha ao salvar a entrega responde 500 genérico, sem usar a fila", async () => {
            pool.query.mock.mockImplementation(async (sql, params) => {
                if (sql.includes("INSERT INTO deliveries")) throw new Error("Falha no banco com detalhe interno");
                return fakeQuery(sql, params);
            });
            destinationAnswers = [500];

            const { status, body } = await request("POST", "/events", event);

            assert.equal(status, 500);
            assert.deepEqual(body, { message: "Erro interno do servidor" });
            assert.equal(publishCalls.length, 0);
        });
    });
});
