const express = require("express");
const helmet = require("helmet");
const { HttpError } = require("./http/errors.js");
const { logRequestError, requestLogger } = require("./http/request_logging.js");

const playersRoutes = require("./routes/players_routes.js");
const monstersRoutes = require("./routes/monsters_routes.js");
const enemiesRoutes = require("./routes/enemies_routes.js");

const app = express();

app.disable("x-powered-by");
app.use(requestLogger);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

app.use("/api/monsters", monstersRoutes);
app.use("/api/players", playersRoutes);
app.use("/api/enemies", enemiesRoutes);

app.use("/api", (req, res) => {
    res.status(404).json({
        message: "API endpoint not found"
    });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        logRequestError(req, err, "request_error_after_headers");
        return next(new Error(`Request ${req.requestId || "unknown"} failed after headers were sent`));
    }

    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({
            message: "Invalid JSON body"
        });
    }

    if (err?.type === "entity.too.large") {
        return res.status(413).json({
            message: "Request body too large"
        });
    }

    if (err instanceof HttpError) {
        return res.status(err.status).json({
            message: err.message
        });
    }

    logRequestError(req, err);
    res.status(500).json({
        message: "Internal server error"
    });
});

module.exports = app;
