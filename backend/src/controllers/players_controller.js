const playerService = require("../services/players_service");
const { notFound } = require("../http/errors.js");
const {
    requireRecord,
    requireString,
    requireUuid
} = require("../http/validation.js");


// ---- POST

function createPlayer(req, res, next) {
    try {
        requireRecord(req.body);

        const player = {
            username: requireString(req.body.username, "username")
        };

        const createdPlayer = playerService.createPlayer(player);

        res.status(201).json({
            message: "Player created!",
            player: createdPlayer
        });
    } catch (error) {
        next(error);
    }
}

// ---- GET

function getPlayerByUuid(req, res, next) {
    try {
        const uuid = requireUuid(req.params.uuid, "uuid");
        const player = playerService.getPlayerByUuid(uuid);

        if (!player) {
            throw notFound("Player not found");
        }

        res.json({ player });
    } catch (error) {
        next(error);
    }
}


module.exports = {
    createPlayer,
    getPlayerByUuid
};
