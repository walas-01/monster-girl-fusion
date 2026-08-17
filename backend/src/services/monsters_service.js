const db = require("../db/database.js");



/// --- Monster Encyclopedia --- ///

function uploadMonstersToEncyclopedia(monsters) {
    const transaction = db.transaction(() => {

        const checkMonster = db.prepare(`
            SELECT name
            FROM monster_encyclopedia
            WHERE name = ?
        `);

        const insertMonster = db.prepare(`
            INSERT INTO monster_encyclopedia
            (name, display_name, tier, max_hp, atk, spd, aim, image_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertRecipe = db.prepare(`
            INSERT INTO monster_recipes
            (parent_1, parent_2, result)
            VALUES (?, ?, ?)
        `);

        const added = [];
        const skipped = [];

        // --------------------------------------------------
        // PHASE 1: Insert all monsters
        // --------------------------------------------------

        for (const monsterData of monsters) {
            const {
                name, display_name,recipes,image_path,tier,max_hp,spd,atk,aim} = monsterData;

            console.log("[monsters_service]: processing monster: " + name);

            // Check if monster already exists
            const existing = checkMonster.get(name);

            if (existing) {
                console.log("[monsters_service]: monster already exists, skipping: " + name);
                skipped.push(name);
                continue;
            }

            // Insert monster into encyclopedia
            insertMonster.run(name,display_name,tier,max_hp,atk,spd, aim,image_path);

            added.push(name);

            console.log("[monsters_service]: added monster: " + name);
        }


        // --------------------------------------------------
        // PHASE 2: Insert recipes
        // --------------------------------------------------

        for (const monsterData of monsters) {
            const {name,recipes} = monsterData;

            // Don't add recipes for monsters that already existed
            if (!added.includes(name)) {
                continue;
            }

            for (const recipe of recipes) {
                insertRecipe.run(recipe.parent_1,recipe.parent_2,name);
            }
        }


        return {added,skipped};
    });

    return transaction();
}


function getAllMonstersFromEncyclopedia() {
    return db.prepare(`
        SELECT * FROM monster_encyclopedia
    `).all();
}


/// --- Monster Recipes --- ///


//! [GET]
function getAllRecipes(){
    return db.prepare(`
        SELECT * FROM monster_recipes
    `).all();
}




//! [PUT]
function updateMonsterRecipes(resultMonster, recipes) {
    const transaction = db.transaction(() => {

        // Make sure the result monster exists
        const monster = db.prepare(`
            SELECT name
            FROM monster_encyclopedia
            WHERE name = ?
        `).get(resultMonster);

        if (!monster) {
            throw new Error(
                `Monster '${resultMonster}' does not exist in the encyclopedia`
            );
        }

        // Remove the old recipes
        db.prepare(`
            DELETE FROM monster_recipes
            WHERE result = ?
        `).run(resultMonster);

        // Insert the new recipes
        const statement = db.prepare(`
            INSERT INTO monster_recipes
                (parent_1, parent_2, result)
            VALUES (?, ?, ?)
        `);

        for (const recipe of recipes) {
            statement.run(
                recipe.parent_1,
                recipe.parent_2,
                resultMonster
            );
        }
    });

    transaction();
}










/// --- Monster Instances --- ///

function createMonster(species, nickname, playerId) {
    const encyclopediaMonster = db.prepare(`
        SELECT max_hp, atk, spd, aim
        FROM monster_encyclopedia
        WHERE name = ?
    `).get(species);

    // validation
    if (!encyclopediaMonster) {
        throw new Error(`Monster species '${species}' does not exist`);
    }

    // Create the monster instance
    const statement = db.prepare(`
        INSERT INTO monsters (
            species,
            nickname,
            max_hp,
            atk,
            spd,
            aim,
            owner_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = statement.run(
        species,
        nickname,
        encyclopediaMonster.max_hp,
        encyclopediaMonster.atk,
        encyclopediaMonster.spd,
        encyclopediaMonster.aim,
        playerId
    );

    return {
        id: result.lastInsertRowid,
        species,
        nickname,
        max_hp: encyclopediaMonster.max_hp,
        atk: encyclopediaMonster.atk,
        spd: encyclopediaMonster.spd,
        aim: encyclopediaMonster.aim,
        playerId: playerId
    };
}




function getAllMonstersForPlayer(playerId) {
    return db.prepare(`
        SELECT * FROM monsters
        WHERE owner_id = ?
    `).all(playerId);
}



function fuseMonsters(parent1Id, parent2Id, playerId) {
    const transaction = db.transaction(() => {
        // 1. Get both monsters making sure they belong to the player
        const getMonster = db.prepare(`
            SELECT id, species, nickname
            FROM monsters
            WHERE id = ? AND owner_id = ?
        `);

        const parent1 = getMonster.get(parent1Id, playerId);
        const parent2 = getMonster.get(parent2Id, playerId);

        // validations
        if (!parent1) {
            throw new Error(`Monster ${parent1Id} not found or does not belong to player`);
        }
        if (!parent2) {
            throw new Error(`Monster ${parent2Id} not found or does not belong to player`);
        }
        if (parent1Id === parent2Id) {
            throw new Error("A monster cannot be fused with itself");
        }

        // 2. Find a recipe using their species
        const recipe = db.prepare(`
            SELECT result
            FROM monster_recipes
            WHERE
                (parent_1 = ? AND parent_2 = ?)
                OR
                (parent_1 = ? AND parent_2 = ?)
            LIMIT 1
        `).get(parent1.species,parent2.species,parent2.species,parent1.species);


        if (!recipe) {
            throw new Error(
                `No fusion recipe exists for ${parent1.species} + ${parent2.species}`
            );
        }
        // 3. Create the resulting monster
        const resultMonster = createMonster(recipe.result, null,playerId);

        // 4. Delete the two original monsters
        const deleteMonster = db.prepare(`
            DELETE FROM monsters
            WHERE id = ? AND owner_id = ?
        `);

        deleteMonster.run(parent1Id, playerId);
        deleteMonster.run(parent2Id, playerId);

        // 5. Return the newly created monster
        return resultMonster;
    });

    return transaction();
}








module.exports = {
    uploadMonstersToEncyclopedia,
    getAllMonstersFromEncyclopedia,
    createMonster,
    getAllMonstersForPlayer,
    getAllRecipes,
    updateMonsterRecipes,
    fuseMonsters
};