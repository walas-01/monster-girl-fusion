const { badRequest } = require("./errors.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireRecord(value, field = "Request body") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw badRequest(`${field} must be an object`);
    }

    return value;
}

function requireString(value, field) {
    if (typeof value !== "string" || !value.trim()) {
        throw badRequest(`${field} must be a non-empty string`);
    }

    return value.trim();
}

function requireIntegerAtLeast(value, minimum, field) {
    if (!Number.isSafeInteger(value) || value < minimum) {
        throw badRequest(`${field} must be an integer greater than or equal to ${minimum}`);
    }

    return value;
}

function requirePositiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw badRequest(`${field} must be a positive integer`);
    }

    return value;
}

function requirePositiveIntegerParameter(value, field) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw badRequest(`${field} must be a positive integer`);
    }

    return requirePositiveInteger(Number(value), field);
}

function requireNonnegativeInteger(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw badRequest(`${field} must be a nonnegative integer`);
    }

    return value;
}

function requireUuid(value, field) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
        throw badRequest(`${field} must be a valid UUID`);
    }

    return value.toLowerCase();
}

module.exports = {
    requireRecord,
    requireString,
    requireIntegerAtLeast,
    requirePositiveInteger,
    requirePositiveIntegerParameter,
    requireNonnegativeInteger,
    requireUuid
};
