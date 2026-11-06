// Só vale tentar de novo quando o problema pode ser passageiro: o destino não
// respondeu (null), demorou (408), pediu para esperar (429) ou falhou internamente (5xx).
function isRetryable(httpStatus) {
    return httpStatus === null
        || httpStatus === 408
        || httpStatus === 429
        || (httpStatus >= 500 && httpStatus < 600);
}

export default isRetryable;
