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

    return { username: username, id: result.lastInsertRowid, uuid: uuid } ; // returns the id and uuid of the new player
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