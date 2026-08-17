const playerService = require("../services/players_service");


// ---- POST

function createPlayer(req, res) {
    const player = req.body;

    // VALIDATION 
    // here I should validate the incoming data to match the type of variable and length


    const id = playerService.createPlayer(player);

    console.log("[post]: player created with id: " + id);
    res.status(201).json({
        message: "Player created!",
        id: id
    });
}

// ---- GET

function getAllPlayers(req, res) {
    const players = playerService.getAllPlayers();
    res.status(200).json(players);
}




module.exports = {
    createPlayer,
    getAllPlayers
};