const path = require("path");

const DEFAULT_PORT = 3001;
const DEFAULT_DATABASE_PATH = path.resolve(__dirname, "../game.db");

function getPort(value = process.env.PORT) {
    if (value === undefined) {
        return DEFAULT_PORT;
    }

    const normalizedValue = String(value).trim();

    if (!/^\d+$/.test(normalizedValue)) {
        throw new Error("PORT must be an integer between 0 and 65535");
    }

    const port = Number(normalizedValue);

    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
        throw new Error("PORT must be an integer between 0 and 65535");
    }

    return port;
}

function getDatabasePath(value = process.env.DATABASE_PATH) {
    if (value === undefined) {
        return DEFAULT_DATABASE_PATH;
    }

    const normalizedValue = String(value).trim();

    if (!normalizedValue) {
        throw new Error("DATABASE_PATH must not be empty");
    }

    return path.resolve(normalizedValue);
}

module.exports = {
    getPort,
    getDatabasePath
};
