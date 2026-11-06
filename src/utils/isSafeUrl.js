import dns from "node:dns/promises";
import net from "node:net";
import { setTimeout as wait } from "node:timers/promises";

const DNS_TIMEOUT_MS = 3000;

function createBlockList(family, subnets) {
    const blockList = new net.BlockList();

    for (const [address, prefix] of subnets) {
        blockList.addSubnet(address, prefix, family);
    }

    return blockList;
}

// As listas são separadas porque o BlockList também compara um IPv4 com as regras
// de IPv6, e a regra ::/3 acabaria bloqueando todos os endereços IPv4.
const blockedIpv4 = createBlockList("ipv4", [
    ["0.0.0.0", 8],       // "esta rede"
    ["10.0.0.0", 8],      // privada
    ["100.64.0.0", 10],   // compartilhada entre operadoras (CGNAT)
    ["127.0.0.0", 8],     // a própria máquina (loopback)
    ["169.254.0.0", 16],  // link-local, inclui os metadados de nuvem
    ["172.16.0.0", 12],   // privada
    ["192.0.0.0", 24],    // reservada
    ["192.0.2.0", 24],    // documentação
    ["192.88.99.0", 24],  // reservada (6to4)
    ["192.168.0.0", 16],  // privada
    ["198.18.0.0", 15],   // testes de desempenho
    ["198.51.100.0", 24], // documentação
    ["203.0.113.0", 24],  // documentação
    ["224.0.0.0", 4],     // multicast
    ["240.0.0.0", 4]      // reservada, inclui 255.255.255.255
]);

// No IPv6, apenas a faixa 2000::/3 é pública. As três primeiras regras bloqueiam todo
// o resto: ::1, fc00::/7 (privada), fe80::/10 (link-local) e IPv4 escrito como IPv6.
const blockedIpv6 = createBlockList("ipv6", [
    ["::", 3],
    ["4000::", 2],
    ["8000::", 1],
    ["2001::", 23],     // reservada
    ["2001:db8::", 32], // documentação
    ["2002::", 16],     // 6to4, pode conter um IPv4 privado
    ["3fff::", 20]      // documentação
]);

function isBlockedAddress({ address, family }) {
    return family === 4
        ? blockedIpv4.check(address, "ipv4")
        : blockedIpv6.check(address, "ipv6");
}

function arePrivateUrlsAllowed() {
    return process.env.ALLOW_PRIVATE_URLS === "true" && process.env.NODE_ENV !== "production";
}

// SAFE: pode enviar.
// BLOCKED: a URL não é permitida, e tentar de novo não mudaria isso.
// UNVERIFIED: o DNS não respondeu, então não há como verificar agora. A falha é temporária.
async function checkUrl(url) {
    let urlObject;

    try {
        urlObject = new URL(url);
    } catch (error) {
        return "BLOCKED";
    }

    if (urlObject.protocol !== "http:" && urlObject.protocol !== "https:") return "BLOCKED";

    if (arePrivateUrlsAllowed()) return "SAFE";

    // O hostname de um IPv6 vem entre colchetes: [::1]
    const hostname = urlObject.hostname.replace(/^\[|\]$/g, "");

    try {
        const addresses = await Promise.race([
            dns.lookup(hostname, { all: true }),
            wait(DNS_TIMEOUT_MS, null, { ref: false })
        ]);

        if (!addresses?.length) return "UNVERIFIED";

        // Um único endereço bloqueado já recusa a URL.
        return addresses.some(isBlockedAddress) ? "BLOCKED" : "SAFE";
    } catch (error) {
        return "UNVERIFIED";
    }
}

async function isSafeUrl(url) {
    return (await checkUrl(url)) === "SAFE";
}

export default isSafeUrl;
export { checkUrl };
