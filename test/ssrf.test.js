import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import pool from "../src/config/database.js";
import registerEndpoint from "../src/services/endpointService.js";
import deliverEvent from "../src/services/eventService.js";
import retryDeliveryById from "../src/services/retryService.js";
import sendWebhook from "../src/services/webhookService.js";
import isSafeUrl, { checkUrl } from "../src/utils/isSafeUrl.js";
import normalizeAndValidateUrl from "../src/utils/normalizeAndValidateUrl.js";

const realFetch = globalThis.fetch;
const event = { endpointId: 2, type: "payment.approved", data: { orderId: 123, amount: 150 } };
const BLOCKED_SEND = { status: "FAILED", httpStatus: null, blocked: true };
const UNVERIFIED_SEND = { status: "FAILED", httpStatus: null, blocked: false };

function mockDns(addresses) {
    mock.method(dns, "lookup", async () =>
        addresses.map((address) => ({
            address,
            family: address.includes(":") ? 6 : 4
        }))
    );
}

beforeEach(() => {
    delete process.env.ALLOW_PRIVATE_URLS;
    delete process.env.NODE_ENV;
    process.env.CLOUDFLARE_ACCOUNT_ID = "fake-account";
    process.env.CLOUDFLARE_QUEUE_ID = "fake-queue";
    process.env.CLOUDFLARE_API_TOKEN = "fake-token";

    mock.method(pool, "query", async () => {
        throw new Error("Consulta inesperada ao banco");
    });
    mock.method(globalThis, "fetch", async () => {
        throw new Error("Chamada de rede inesperada");
    });
    mock.method(console, "error", () => {});
    mock.method(console, "log", () => {});
});

afterEach(() => {
    mock.restoreAll();
});

describe("normalizeAndValidateUrl: somente HTTP e HTTPS", () => {
    const accepted = {
        "http://example.com/hook": "http://example.com/hook",
        "https://example.com/hook": "https://example.com/hook",
        "HTTPS://EXAMPLE.COM/hook": "https://example.com/hook",
        "example.com/hook": "http://example.com/hook",
        "example.com:8080/hook": "http://example.com:8080/hook",
        "localhost:4000/webhook": "http://localhost:4000/webhook"
    };

    for (const [input, expected] of Object.entries(accepted)) {
        it(`aceita ${input}`, () => {
            assert.equal(normalizeAndValidateUrl(input), expected);
        });
    }

    const refused = [
        "ftp://example.com/x",
        "file:///etc/passwd",
        "file:/etc/passwd",
        "gopher://example.com/",
        "ws://example.com/",
        "javascript:alert(1)",
        "data:text/plain,oi",
        "http://user:pass@example.com/",
        "not a url"
    ];

    for (const input of refused) {
        it(`recusa ${input}`, () => {
            assert.equal(normalizeAndValidateUrl(input), null);
        });
    }
});

describe("isSafeUrl: endereços", () => {
    const blocked = [
        "http://0.0.0.0/",
        "http://0.255.255.255/",
        "http://10.0.0.1/",
        "http://10.255.255.255/",
        "http://100.64.0.1/",
        "http://100.127.255.255/",
        "http://127.0.0.1/",
        "http://127.255.255.254/",
        "http://169.254.169.254/latest/meta-data/",
        "http://172.16.0.1/",
        "http://172.31.255.255/",
        "http://192.0.0.1/",
        "http://192.0.2.1/",
        "http://192.88.99.1/",
        "http://192.168.0.1/",
        "http://198.18.0.1/",
        "http://198.19.255.255/",
        "http://198.51.100.1/",
        "http://203.0.113.1/",
        "http://224.0.0.1/",
        "http://239.255.255.255/",
        "http://240.0.0.1/",
        "http://255.255.255.255/",
        "http://[::]/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://[::ffff:10.0.0.1]/",
        "http://[64:ff9b::7f00:1]/",
        "http://[100::1]/",
        "http://[2001::1]/",
        "http://[2001:db8::1]/",
        "http://[2002:7f00:1::]/",
        "http://[3fff::1]/",
        "http://[fc00::1]/",
        "http://[fd00::1]/",
        "http://[fe80::1]/",
        "http://[fec0::1]/",
        "http://[ff02::1]/"
    ];

    for (const url of blocked) {
        it(`bloqueia ${url}`, async () => {
            assert.equal(await isSafeUrl(url), false);
        });
    }

    const disguised = [
        "http://localhost/",
        "http://2130706433/",
        "http://0x7f.0.0.1/",
        "http://0177.0.0.1/",
        "http://127.1/",
        "http://0/",
        "http://%31%32%37.0.0.1/",
        "http://１２７.０.０.１/",
        "http://127.0.0.1\\@example.com/"
    ];

    for (const url of disguised) {
        it(`bloqueia o endereço local disfarçado ${url}`, async () => {
            assert.equal(await isSafeUrl(url), false);
        });
    }

    const allowed = [
        "http://8.8.8.8/",
        "https://1.1.1.1/",
        "http://9.255.255.255/",
        "http://11.0.0.1/",
        "http://100.63.255.255/",
        "http://100.128.0.1/",
        "http://126.255.255.255/",
        "http://128.0.0.1/",
        "http://169.253.255.255/",
        "http://169.255.0.1/",
        "http://172.15.255.255/",
        "http://172.32.0.1/",
        "http://192.0.1.1/",
        "http://192.0.3.1/",
        "http://192.88.98.255/",
        "http://192.88.100.1/",
        "http://192.167.255.255/",
        "http://192.169.0.1/",
        "http://198.17.255.255/",
        "http://198.20.0.1/",
        "http://198.51.99.255/",
        "http://198.51.101.1/",
        "http://203.0.112.255/",
        "http://203.0.114.1/",
        "http://223.255.255.255/",
        "http://[2000::1]/",
        "http://[2606:4700:4700::1111]/",
        "http://[2001:4860:4860::8888]/"
    ];

    for (const url of allowed) {
        it(`permite o endereço público ${url}`, async () => {
            assert.equal(await isSafeUrl(url), true);
        });
    }

    it("recusa protocolo que não seja HTTP ou HTTPS", async () => {
        assert.equal(await isSafeUrl("ftp://8.8.8.8/"), false);
        assert.equal(await isSafeUrl("data:text/plain,oi"), false);
    });

    it("recusa texto que não é uma URL", async () => {
        assert.equal(await isSafeUrl("not a url"), false);
    });
});

describe("isSafeUrl: DNS", () => {
    it("bloqueia um domínio que aponta para um IP privado", async () => {
        mockDns(["10.0.0.5"]);
        assert.equal(await isSafeUrl("https://evil.example/"), false);
    });

    it("bloqueia um domínio que aponta para os metadados da nuvem", async () => {
        mockDns(["169.254.169.254"]);
        assert.equal(await isSafeUrl("https://evil.example/"), false);
    });

    it("bloqueia um domínio que aponta para um IPv6 local", async () => {
        mockDns(["::1"]);
        assert.equal(await isSafeUrl("https://evil.example/"), false);
    });

    it("bloqueia um domínio com um IP público e um privado", async () => {
        mockDns(["8.8.8.8", "10.0.0.5"]);
        assert.equal(await isSafeUrl("https://evil.example/"), false);
    });

    it("permite um domínio que aponta só para IPs públicos", async () => {
        mockDns(["8.8.8.8", "2606:4700:4700::1111"]);
        assert.equal(await isSafeUrl("https://good.example/"), true);
    });

    it("recusa um domínio que o DNS não encontra", async () => {
        mock.method(dns, "lookup", async () => {
            throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
        });
        assert.equal(await isSafeUrl("https://missing.example/"), false);
    });

    it("recusa quando o DNS não devolve nenhum endereço", async () => {
        mockDns([]);
        assert.equal(await isSafeUrl("https://empty.example/"), false);
    });

    it("recusa quando o DNS demora mais de 3 segundos", async () => {
        mock.method(dns, "lookup", () => new Promise(() => {}));
        // Mantém o processo vivo durante a espera, já que o timer do DNS não faz isso.
        const keepAlive = setTimeout(() => {}, 4000);
        const startedAt = Date.now();

        assert.equal(await isSafeUrl("https://slow.example/"), false);
        assert.ok(Date.now() - startedAt >= 2900);
        clearTimeout(keepAlive);
    });

    it("consulta um IPv6 sem os colchetes da URL", async () => {
        mockDns(["2606:4700:4700::1111"]);

        assert.equal(await isSafeUrl("http://[2606:4700:4700::1111]/"), true);
        assert.equal(dns.lookup.mock.calls[0].arguments[0], "2606:4700:4700::1111");
    });
});

describe("isSafeUrl: ALLOW_PRIVATE_URLS", () => {
    const local = "http://localhost:4000/webhook";

    it("com true, permite URL local e não consulta o DNS", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        mockDns(["127.0.0.1"]);

        assert.equal(await isSafeUrl(local), true);
        assert.equal(await isSafeUrl("http://192.168.0.10/"), true);
        assert.equal(dns.lookup.mock.callCount(), 0);
    });

    it("com true, continua recusando outros protocolos", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        assert.equal(await isSafeUrl("ftp://localhost/"), false);
    });

    it("é ignorada em produção", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        process.env.NODE_ENV = "production";
        assert.equal(await isSafeUrl(local), false);
    });

    for (const value of [undefined, "false", "1", "TRUE", ""]) {
        it(`bloqueia URL local com o valor ${JSON.stringify(value)}`, async () => {
            if (value !== undefined) process.env.ALLOW_PRIVATE_URLS = value;
            assert.equal(await isSafeUrl(local), false);
        });
    }
});

describe("Cadastro de endpoints", () => {
    const refused = [
        "http://127.0.0.1:5432/",
        "localhost:4000/webhook",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]:5432/",
        "http://2130706433/",
        "ftp://example.com/x",
        "file:///etc/passwd"
    ];

    for (const url of refused) {
        it(`recusa ${url} sem gravar no banco`, async () => {
            await assert.rejects(registerEndpoint("destino", url), { status: 400 });
            assert.equal(pool.query.mock.callCount(), 0);
        });
    }

    it("recusa um domínio que aponta para um IP privado", async () => {
        mockDns(["192.168.0.10"]);
        await assert.rejects(registerEndpoint("destino", "https://evil.example/"), { status: 400 });
        assert.equal(pool.query.mock.callCount(), 0);
    });

    function mockEndpointInsert() {
        pool.query.mock.mockImplementation(async (sql, params) =>
            sql.startsWith("SELECT") ? { rows: [] } : { rows: [{ id: 1, name: params[0], url: params[1] }] }
        );
    }

    it("aceita um domínio público", async () => {
        mockDns(["8.8.8.8"]);
        mockEndpointInsert();

        const endpoint = await registerEndpoint("destino", "https://good.example/hook");
        assert.equal(endpoint.url, "https://good.example/hook");
    });

    it("aceita o test-server com ALLOW_PRIVATE_URLS=true", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        mockEndpointInsert();

        const endpoint = await registerEndpoint("destino", "localhost:4000/webhook");
        assert.equal(endpoint.url, "http://localhost:4000/webhook");
    });
});

describe("Envio do webhook", () => {
    const hits = [];
    let server;
    let baseUrl;

    before(async () => {
        server = http.createServer((req, res) => {
            hits.push(req.url);

            if (req.url === "/redirect") {
                res.writeHead(302, { Location: `${baseUrl}/internal` });
                return res.end();
            }

            res.writeHead(200);
            res.end();
        });

        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => {
        server.closeAllConnections();
        server.close();
    });

    beforeEach(() => {
        hits.length = 0;
    });

    it("não chama um destino local sem ALLOW_PRIVATE_URLS", async () => {
        globalThis.fetch.mock.mockImplementation(realFetch);

        assert.deepEqual(await sendWebhook(`${baseUrl}/ok`, event), BLOCKED_SEND);
        assert.deepEqual(hits, []);
    });

    it("não chama um destino local em produção, mesmo com ALLOW_PRIVATE_URLS=true", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        process.env.NODE_ENV = "production";
        globalThis.fetch.mock.mockImplementation(realFetch);

        assert.deepEqual(await sendWebhook(`${baseUrl}/ok`, event), BLOCKED_SEND);
        assert.deepEqual(hits, []);
    });

    it("entrega em um destino local com ALLOW_PRIVATE_URLS=true", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        globalThis.fetch.mock.mockImplementation(realFetch);

        assert.deepEqual(await sendWebhook(`${baseUrl}/ok`, event), { status: "SUCCESS", httpStatus: 200, blocked: false });
        assert.deepEqual(hits, ["/ok"]);
    });

    it("não segue redirecionamentos", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        globalThis.fetch.mock.mockImplementation(realFetch);

        assert.deepEqual(await sendWebhook(`${baseUrl}/redirect`, event), { status: "FAILED", httpStatus: 302, blocked: false });
        assert.deepEqual(hits, ["/redirect"]);
    });

    it("não chama um domínio que passou a apontar para um IP privado", async () => {
        mockDns(["10.0.0.5"]);

        assert.deepEqual(await sendWebhook("https://evil.example/", event), BLOCKED_SEND);
        assert.equal(globalThis.fetch.mock.callCount(), 0);
    });

    it("não chama o destino quando o DNS não responde, mas a falha não é definitiva", async () => {
        mock.method(dns, "lookup", async () => {
            throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
        });

        assert.deepEqual(await sendWebhook("https://missing.example/", event), UNVERIFIED_SEND);
        assert.equal(globalThis.fetch.mock.callCount(), 0);
    });

    it("envia para um domínio público, mantendo timeout, header e corpo", async () => {
        mockDns(["8.8.8.8"]);
        globalThis.fetch.mock.mockImplementation(async () => new Response(null, { status: 200 }));

        const result = await sendWebhook("https://good.example/hook", { ...event, extra: "x" });
        const [url, options] = globalThis.fetch.mock.calls[0].arguments;

        assert.deepEqual(result, { status: "SUCCESS", httpStatus: 200, blocked: false });
        assert.equal(url, "https://good.example/hook");
        assert.equal(options.method, "POST");
        assert.equal(options.redirect, "manual");
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(options.headers["Content-Type"], "application/json");
        assert.deepEqual(JSON.parse(options.body), event);
    });
});

describe("Fluxos completos com destino bloqueado", () => {
    const internalUrl = "http://169.254.169.254/latest/meta-data/";

    it("POST /events: registra a falha e não agenda retry", async () => {
        const inserted = [];

        pool.query.mock.mockImplementation(async (sql, params) => {
            if (sql.includes("FROM endpoints")) return { rows: [{ id: 2, url: internalUrl }] };
            inserted.push(params);
            return { rows: [{ id: 7 }] };
        });
        globalThis.fetch.mock.mockImplementation(async () => Response.json({ success: true }));

        const result = await deliverEvent(event);

        assert.deepEqual(result, { ...BLOCKED_SEND, deliveryId: 7, retryScheduled: false });
        assert.deepEqual(inserted[0].slice(3), ["FAILED", null]);
        assert.equal(globalThis.fetch.mock.callCount(), 0);
    });

    it("POST /events: DNS sem resposta continua agendando retry", async () => {
        mock.method(dns, "lookup", async () => {
            throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
        });
        pool.query.mock.mockImplementation(async (sql) => {
            if (sql.includes("FROM endpoints")) return { rows: [{ id: 2, url: "https://missing.example/" }] };
            return { rows: [{ id: 7 }] };
        });
        globalThis.fetch.mock.mockImplementation(async () => Response.json({ success: true }));

        const result = await deliverEvent(event);
        const calledUrls = globalThis.fetch.mock.calls.map((call) => call.arguments[0]);

        assert.deepEqual(result, { ...UNVERIFIED_SEND, deliveryId: 7, retryScheduled: true });
        assert.equal(calledUrls.length, 1);
        assert.ok(calledUrls[0].startsWith("https://api.cloudflare.com/"));
    });

    it("Retry: encerra as tentativas sem chamar o destino", async () => {
        const updates = [];

        pool.query.mock.mockImplementation(async (sql, params) => {
            if (sql.includes("FROM deliveries")) {
                return {
                    rows: [{ id: 7, endpoint_id: 2, event_type: "t", payload: {}, status: "FAILED", http_status: null, attempts: 1 }]
                };
            }
            if (sql.includes("FROM endpoints")) return { rows: [{ id: 2, url: internalUrl }] };
            updates.push(params);
            return { rows: [], rowCount: 1 };
        });

        const result = await retryDeliveryById(7);

        assert.equal(result.status, "PERMANENT_FAILURE");
        assert.equal(result.httpStatus, null);
        assert.deepEqual(updates, [["FAILED", null, 7]]);
        assert.equal(globalThis.fetch.mock.callCount(), 0);
    });
});

describe("checkUrl: diferença entre bloqueado e não verificado", () => {
    for (const url of ["http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/", "ftp://8.8.8.8/", "not a url"]) {
        it(`${url} é BLOCKED`, async () => {
            assert.equal(await checkUrl(url), "BLOCKED");
        });
    }

    it("domínio que aponta para um IP privado é BLOCKED", async () => {
        mockDns(["10.0.0.5"]);
        assert.equal(await checkUrl("https://evil.example/"), "BLOCKED");
    });

    it("domínio que aponta para um IP público é SAFE", async () => {
        mockDns(["8.8.8.8"]);
        assert.equal(await checkUrl("https://good.example/"), "SAFE");
    });

    it("domínio que o DNS não encontra é UNVERIFIED", async () => {
        mock.method(dns, "lookup", async () => {
            throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
        });
        assert.equal(await checkUrl("https://missing.example/"), "UNVERIFIED");
    });

    it("resposta vazia do DNS é UNVERIFIED", async () => {
        mockDns([]);
        assert.equal(await checkUrl("https://empty.example/"), "UNVERIFIED");
    });

    it("URL local com ALLOW_PRIVATE_URLS=true é SAFE", async () => {
        process.env.ALLOW_PRIVATE_URLS = "true";
        assert.equal(await checkUrl("http://localhost:4000/webhook"), "SAFE");
    });
});
