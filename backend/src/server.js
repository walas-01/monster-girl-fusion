const http = require("node:http");

const app = require("./app.js");
const db = require("./db/database.js");
const { getPort } = require("./config.js");

const REQUEST_TIMEOUT_MS = 15_000;
const HEADERS_TIMEOUT_MS = 10_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const SHUTDOWN_GRACE_PERIOD_MS = 10_000;
const serverStates = new WeakMap();
const closePromises = new WeakMap();
const shutdownPromises = new WeakMap();

function createHttpServer(requestListener = app) {
    const server = http.createServer();
    const state = {
        activeRequests: new Map(),
        shuttingDown: false,
        sockets: new Set()
    };

    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = HEADERS_TIMEOUT_MS;
    server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

    server.on("connection", socket => {
        state.sockets.add(socket);
        state.activeRequests.set(socket, 0);
        socket.once("close", () => {
            state.sockets.delete(socket);
            state.activeRequests.delete(socket);
        });
    });

    server.on("request", (req, res) => {
        const socket = req.socket;
        const activeCount = (state.activeRequests.get(socket) || 0) + 1;
        let released = false;

        state.activeRequests.set(socket, activeCount);

        if (state.shuttingDown && !res.headersSent) {
            res.setHeader("Connection", "close");
        }

        function releaseRequest() {
            if (released) {
                return;
            }

            released = true;
            const remaining = Math.max((state.activeRequests.get(socket) || 1) - 1, 0);
            state.activeRequests.set(socket, remaining);

            if (state.shuttingDown && remaining === 0) {
                socket.end();
            }
        }

        res.once("finish", releaseRequest);
        res.once("close", releaseRequest);
    });
    server.on("request", requestListener);

    serverStates.set(server, state);
    return server;
}

function startServer(port = getPort()) {
    const server = createHttpServer();

    server.listen(port, () => {
        const address = server.address();
        console.log(`[localhost:${address.port}]: server up and running`);
    });

    return server;
}

function closeHttpServer(server, { gracePeriodMs = SHUTDOWN_GRACE_PERIOD_MS } = {}) {
    const existingClose = closePromises.get(server);

    if (existingClose) {
        return existingClose;
    }

    if (!Number.isSafeInteger(gracePeriodMs) || gracePeriodMs < 0) {
        return Promise.reject(new Error("gracePeriodMs must be a nonnegative integer"));
    }

    if (!server.listening) {
        return Promise.resolve({ forced: false });
    }

    const closePromise = new Promise((resolve, reject) => {
        let forced = false;
        const state = serverStates.get(server);

        if (state) {
            state.shuttingDown = true;
        }

        const timer = setTimeout(() => {
            forced = true;

            for (const socket of state?.sockets || []) {
                socket.destroy();
            }
        }, gracePeriodMs);

        timer.unref();

        server.close(error => {
            clearTimeout(timer);

            if (error) {
                reject(error);
                return;
            }

            resolve({ forced });
        });

        for (const socket of state?.sockets || []) {
            if ((state.activeRequests.get(socket) || 0) === 0) {
                socket.end();
            }
        }

        if (typeof server.closeIdleConnections === "function") {
            server.closeIdleConnections();
        }
    });

    closePromises.set(server, closePromise);
    return closePromise;
}

function shutdownServer(
    server,
    { database = db, gracePeriodMs = SHUTDOWN_GRACE_PERIOD_MS } = {}
) {
    const existingShutdown = shutdownPromises.get(server);

    if (existingShutdown) {
        return existingShutdown;
    }

    const shutdownPromise = closeHttpServer(server, { gracePeriodMs })
        .finally(() => {
            if (database.open) {
                database.close();
            }
        });

    shutdownPromises.set(server, shutdownPromise);
    return shutdownPromise;
}

function registerShutdownHandlers(server, options) {
    let shutdownPromise = null;

    function handleSignal(signal) {
        if (shutdownPromise) {
            return;
        }

        console.log(JSON.stringify({
            level: "info",
            event: "shutdown_started",
            signal
        }));

        shutdownPromise = shutdownServer(server, options)
            .then(({ forced }) => {
                console.log(JSON.stringify({
                    level: forced ? "warn" : "info",
                    event: forced ? "shutdown_forced" : "shutdown_completed",
                    signal
                }));
            })
            .catch(error => {
                process.exitCode = 1;
                console.error(JSON.stringify({
                    level: "error",
                    event: "shutdown_failed",
                    signal,
                    errorType: error instanceof Error ? error.constructor.name : typeof error
                }));
            });
    }

    const handleSigint = () => handleSignal("SIGINT");
    const handleSigterm = () => handleSignal("SIGTERM");

    process.once("SIGINT", handleSigint);
    process.once("SIGTERM", handleSigterm);

    return () => {
        process.removeListener("SIGINT", handleSigint);
        process.removeListener("SIGTERM", handleSigterm);
    };
}

if (require.main === module) {
    const server = startServer();
    registerShutdownHandlers(server);
}

module.exports = {
    REQUEST_TIMEOUT_MS,
    HEADERS_TIMEOUT_MS,
    KEEP_ALIVE_TIMEOUT_MS,
    SHUTDOWN_GRACE_PERIOD_MS,
    createHttpServer,
    startServer,
    closeHttpServer,
    shutdownServer,
    registerShutdownHandlers
};
