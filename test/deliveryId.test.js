import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import express from "express";

import pool from "../src/config/database.js";
import deliveriesRoutes from "../src/routes/deliveriesRoutes.js";
import parseDeliveryId from "../src/utils/parseDeliveryId.js";

const INVALID_IDS = [
    "abc",
    "1.5",
    "1.0",
    "-1",
    "0",
    "-0",
    "2147483648",
    "99999999999",
    "99999999999999999999",
    "1e3",
    "0x10",
    "+5",
    " 5",
    "5 ",
    "",
    "NaN",
    "Infinity",
    "undefined",
    "null",
    "1;DROP TABLE deliveries"
];

describe("parseDeliveryId", () => {
    for (const [input, expected] of [
        ["1", 1],
        ["42", 42],
        ["2147483647", 2147483647]
    ]) {
        it(`aceita "${input}" e devolve um número`, () => {
            assert.equal(parseDeliveryId(input), expected);
        });
    }

    for (const input of INVALID_IDS) {
        it(`recusa "${input}" com status 400`, () => {
            assert.throws(() => parseDeliveryId(input), { status: 400 });
        });
    }
});

describe("Rotas de entregas", () => {
    let server;
    let baseUrl;

    before(async () => {
        const app = express();
        app.use(express.json());
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
        mock.method(pool, "query", async () => {
            throw new Error("Consulta inesperada ao banco");
        });
        mock.method(console, "error", () => {});
    });

    afterEach(() => {
        mock.restoreAll();
    });

    async function request(method, path) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        return { status: response.status, body: await response.json() };
    }

    const routes = [
        ["GET", (id) => `/deliveries/${id}`],
        ["POST", (id) => `/deliveries/${id}/retry`]
    ];

    for (const [method, path] of routes) {
        const route = `${method} ${path(":id")}`;

        for (const id of ["abc", "1.5", "-1", "0", "2147483648", "99999999999", "1e3", "0x10", "%205"]) {
            it(`${route} recusa "${id}" com 400, sem consultar o banco e sem log`, async () => {
                const { status, body } = await request(method, path(id));

                assert.equal(status, 400);
                assert.equal(typeof body.message, "string");
                assert.equal(pool.query.mock.callCount(), 0);
                assert.equal(console.error.mock.callCount(), 0);
            });
        }

        it(`${route} responde 404 quando a entrega não existe, sem log`, async () => {
            pool.query.mock.mockImplementation(async () => ({ rows: [] }));

            const { status } = await request(method, path(2147483647));

            assert.equal(status, 404);
            assert.deepEqual(pool.query.mock.calls[0].arguments[1], [2147483647]);
            assert.equal(console.error.mock.callCount(), 0);
        });

        it(`${route} registra erro inesperado e não o expõe na resposta`, async () => {
            const failure = new Error('password authentication failed for user "segredo"');
            pool.query.mock.mockImplementation(async () => {
                throw failure;
            });

            const { status, body } = await request(method, path(1));

            assert.equal(status, 500);
            assert.equal(JSON.stringify(body).includes("segredo"), false);
            assert.equal(console.error.mock.callCount(), 1);
            assert.equal(console.error.mock.calls[0].arguments[1], failure);
        });
    }

    it("GET /deliveries/:id devolve a entrega com um ID válido", async () => {
        pool.query.mock.mockImplementation(async () => ({ rows: [{ id: 7, status: "FAILED" }] }));

        const { status, body } = await request("GET", "/deliveries/7");

        assert.equal(status, 200);
        assert.deepEqual(body, { deliveryId: 7, status: "FAILED" });
        assert.deepEqual(pool.query.mock.calls[0].arguments[1], [7]);
    });

    it("POST /deliveries/:id/retry mantém as regras com um ID válido", async () => {
        pool.query.mock.mockImplementation(async () => ({ rows: [{ id: 7, status: "SUCCESS", http_status: 200, attempts: 1 }] }));

        const { status, body } = await request("POST", "/deliveries/7/retry");

        assert.equal(status, 200);
        assert.equal(body.status, "ALREADY_DELIVERED");
        assert.deepEqual(pool.query.mock.calls[0].arguments[1], [7]);
    });
});
