const playerService = require("../services/players_service");
const monstersService = require("../services/monsters_service");


// ---- POST

function createPlayer(req, res) {
    console.log("[post]: creating player")
    const player = req.body;

    const createdPlayer = playerService.createPlayer(player);

    console.log("[post]: player created with id: " + createdPlayer.id);
    res.status(201).json({
        message: "Player created!",
        player: createdPlayer
    });
}

// ---- GET

function getAllPlayers(req, res) {
    const players = playerService.getAllPlayers();
    res.status(200).json(players);
}


function getPlayerByUuid(req, res) {
    const { uuid } = req.params;
    const player = playerService.getPlayerByUuid(uuid);

    if (!player) {
        return res.status(404).json({
            message: "Player not found"
        });
    }

    res.json({ player });
}


module.exports = {
    createPlayer,
    getAllPlayers,
    getPlayerByUuid
};