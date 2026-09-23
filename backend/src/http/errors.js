class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

function badRequest(message) {
    return new HttpError(400, message);
}

function notFound(message) {
    return new HttpError(404, message);
}

function conflict(message) {
    return new HttpError(409, message);
}

module.exports = {
    HttpError,
    badRequest,
    notFound,
    conflict
};
