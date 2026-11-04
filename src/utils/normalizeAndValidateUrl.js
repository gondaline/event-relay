function normalizeAndValidateUrl(string) {

    let urlString = string.trim();

    if (!/^https?:\/\//i.test(urlString)) {
        urlString = 'http://' + urlString;
    }

    try {
        const urlObject = new URL(urlString);

        if(urlObject.protocol === "http:" || urlObject.protocol === "https:") {
            return urlObject.href;
        }

        return null

    } catch (error) {
        return null;
    }
}

export default normalizeAndValidateUrl;