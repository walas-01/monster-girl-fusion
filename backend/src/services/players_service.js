const db = require("../db/database.js");

const { randomUUID } = require("crypto");


// POST

function createPlayer(playerData) {
    const {username} = playerData;
    const uuid = randomUUID();

    const statement = db.prepare(`
        INSERT INTO players
        (username, uuid)
        VALUES (?, ?)
    `);

    const result = statement.run(username, uuid);

    return result.lastInsertRowid; // returns the id of the new player
}

// GET

function getAllPlayers() {
    return db.prepare(`
        SELECT * FROM players
    `).all();
}


module.exports = {
    createPlayer,
    getAllPlayers
};