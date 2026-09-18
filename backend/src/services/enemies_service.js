const db = require("../db/database.js");



function getAllEnemies() {
    const statement = db.prepare(`
        SELECT * 
        FROM enemies
    `);

    return statement.all();
}



function uploadEnemy(enemyData) {
    const statement = db.prepare(`
        INSERT INTO enemies (
            name,
            display_name,
            difficulty,
            max_hp,
            atk,
            spd,
            aim,
            image_path
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
    `);

    const newEnemy = statement.get(
        enemyData.name,
        enemyData.displayName,
        enemyData.difficulty,
        enemyData.maxHp,
        enemyData.atk,
        enemyData.spd,
        enemyData.aim,
        enemyData.imagePath
    );

    return newEnemy;
}

module.exports = {
    uploadEnemy,
    getAllEnemies
};