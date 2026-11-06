function normalizeAndValidateUrl(string) {

    let urlString = string.trim();

    if (!/^https?:\/\//i.test(urlString)) {
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