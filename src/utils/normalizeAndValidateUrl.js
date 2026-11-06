function normalizeAndValidateUrl(url) {

    let urlString = url.trim();

    // Só completa com http:// quando a URL não informa um protocolo. Em "localhost:4000",
    // o número depois dos dois-pontos é uma porta; já "ftp://" e "file:" são protocolos,
    // e acabam recusados pela checagem mais abaixo.
    const hasProtocol = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(urlString);

    if (!hasProtocol) {
        urlString = 'http://' + urlString;
    }

    try {
        const urlObject = new URL(urlString);

        // O fetch não aceita URLs com usuário ou senha, e a credencial
        // acabaria aparecendo nos logs de erro.
        if (urlObject.username || urlObject.password) {
            return null;
        }

        if(urlObject.protocol === "http:" || urlObject.protocol === "https:") {
            return urlObject.href;
        }

        return null

    } catch (error) {
        return null;
    }
}

export default normalizeAndValidateUrl;