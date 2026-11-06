function normalizeAndValidateUrl(url) {
    let urlString = url.trim();

    // Em "localhost:4000", o número depois dos dois-pontos é a porta, não um protocolo.
    const hasProtocol = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(urlString);

    if (!hasProtocol) {
        urlString = "http://" + urlString;
    }

    try {
        const urlObject = new URL(urlString);

        // O fetch recusa URLs com credenciais, e a senha apareceria nos logs de erro.
        if (urlObject.username || urlObject.password) {
            return null;
        }

        if (urlObject.protocol === "http:" || urlObject.protocol === "https:") {
            return urlObject.href;
        }

        return null;
    } catch (error) {
        return null;
    }
}

export default normalizeAndValidateUrl;
