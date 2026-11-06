// Só há retry quando a falha pode ser passageira. null indica que o destino não respondeu.
function isRetryable(httpStatus) {
    return httpStatus === null || httpStatus === 408 || httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600);
}

export default isRetryable;
