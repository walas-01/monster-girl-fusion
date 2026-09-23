const { randomUUID } = require("node:crypto");

const API_ROUTE_BASES = [
    "/api/monsters",
    "/api/players",
    "/api/enemies"
];

function routeTemplate(req) {
    if (!req.route || typeof req.route.path !== "string") {
        return req.originalUrl.startsWith("/api") ? "/api/*" : "unmatched";
    }

    const pathname = req.originalUrl.split("?", 1)[0];
    const routeBase = API_ROUTE_BASES.find(base =>
        pathname === base || pathname.startsWith(`${base}/`)
    );

    if (!routeBase) {
        return req.route.path;
    }

    return req.route.path === "/"
        ? routeBase
        : `${routeBase}${req.route.path}`;
}

function requestLogger(req, res, next) {
    const startedAt = process.hrtime.bigint();
    const requestId = randomUUID();
    let logged = false;

    req.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);

    function logCompletion(event) {
        if (logged) {
            return;
        }

        logged = true;
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

        console.log(JSON.stringify({
            level: "info",
            event,
            requestId,
            method: req.method,
            route: routeTemplate(req),
            status: res.statusCode,
            durationMs: Math.round(durationMs * 1000) / 1000
        }));
    }

    res.once("finish", () => logCompletion("request_completed"));
    res.once("close", () => {
        if (!res.writableFinished) {
            logCompletion("request_aborted");
        }
    });

    next();
}

function logRequestError(req, error, event = "request_error") {
    console.error(JSON.stringify({
        level: "error",
        event,
        requestId: req.requestId || null,
        errorType: error instanceof Error ? error.constructor.name : typeof error
    }));
}

module.exports = {
    requestLogger,
    logRequestError
};
