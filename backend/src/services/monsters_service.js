const db = require("../db/database.js");
const { badRequest, conflict, notFound } = require("../http/errors.js");

function recipeKey(parent1, parent2) {
    return JSON.stringify([parent1, parent2].sort());
}

function assertUniqueRecipePairs(recipes) {
    const seenPairs = new Set();

    for (const recipe of recipes) {
        const key = recipeKey(recipe.parent_1, recipe.parent_2);

        if (seenPairs.has(key)) {
            throw badRequest(`Duplicate recipe for '${recipe.parent_1}' and '${recipe.parent_2}'`);
        }

        seenPairs.add(key);
    }
}

function translateRecipeConstraint(error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw conflict("A recipe already exists for that parent pair");
    }

    if (error.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        throw badRequest("A recipe references an unknown monster");
    }

    throw error;
}

/// -------------------------------------------------------------------------------------- Monster Encyclopedia --- ///

function uploadMonstersToEncyclopedia(monsters) {
    const transaction = db.transaction(() => {
        const existingNames = new Set(
            db.prepare("SELECT name FROM monster_encyclopedia").all().map(monster => monster.name)
        );
        const availableNames = new Set([
            ...existingNames,
            ...monsters.map(monster => monster.name)
        ]);
        const newMonsters = monsters.filter(monster => !existingNames.has(monster.name));
        const recipesToInsert = newMonsters.flatMap(monster =>
            monster.recipes.map(recipe => ({
                ...recipe,
                result: monster.name
            }))
        );

        assertUniqueRecipePairs(recipesToInsert);

        const findConflict = db.prepare(`
            SELECT result
            FROM monster_recipes
            WHERE
                (parent_1 = ? AND parent_2 = ?)
                OR
                (parent_1 = ? AND parent_2 = ?)
        `);

        for (const recipe of recipesToInsert) {
            if (!availableNames.has(recipe.parent_1) || !availableNames.has(recipe.parent_2)) {
                throw badRequest("A recipe references an unknown monster");
            }

            const existingRecipe = findConflict.get(
                recipe.parent_1,
                recipe.parent_2,
                recipe.parent_2,
                recipe.parent_1
            );

            if (existingRecipe) {
                throw conflict(
                    `A recipe already exists for '${recipe.parent_1}' and '${recipe.parent_2}'`
                );
            }
        }

        const insertMonster = db.prepare(`
            INSERT INTO monster_encyclopedia
            (name, display_name, type,tier, max_hp, atk, spd, aim, image_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?,?)
        `);

        const insertRecipe = db.prepare(`
            INSERT INTO monster_recipes
            (parent_1, parent_2, result)
            VALUES (?, ?, ?)
        `);

        for (const monsterData of newMonsters) {
            const {name, display_name,image_path,type,tier,max_hp,spd,atk,aim} = monsterData;

            // Insert monster into encyclopedia
            insertMonster.run(name,display_name,type,tier,max_hp,atk,spd, aim,image_path);
        }

        for (const recipe of recipesToInsert) {
            insertRecipe.run(recipe.parent_1, recipe.parent_2, recipe.result);
        }

        return {
            added: newMonsters.map(monster => monster.name),
            skipped: monsters
                .filter(monster => existingNames.has(monster.name))
                .map(monster => monster.name)
        };
    });

    try {
        return transaction();
    } catch (error) {
        translateRecipeConstraint(error);
    }
}


function getAllMonstersFromEncyclopedia() {
    return db.prepare(`
        SELECT * FROM monster_encyclopedia
    `).all();
}


/// --------------------------------------------------------------------------------------------------- Monster Recipes --- ///


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
            throw notFound(`Monster '${resultMonster}' does not exist in the encyclopedia`);
        }

        assertUniqueRecipePairs(recipes);

        const monsterExists = db.prepare(`
            SELECT 1
            FROM monster_encyclopedia
            WHERE name = ?
        `);
        const findConflict = db.prepare(`
            SELECT result
            FROM monster_recipes
            WHERE result <> ?
              AND (
                    (parent_1 = ? AND parent_2 = ?)
                    OR
                    (parent_1 = ? AND parent_2 = ?)
              )
        `);

        for (const recipe of recipes) {
            if (!monsterExists.get(recipe.parent_1) || !monsterExists.get(recipe.parent_2)) {
                throw badRequest("A recipe references an unknown monster");
            }

            const existingRecipe = findConflict.get(
                resultMonster,
                recipe.parent_1,
                recipe.parent_2,
                recipe.parent_2,
                recipe.parent_1
            );

            if (existingRecipe) {
                throw conflict(
                    `A recipe already exists for '${recipe.parent_1}' and '${recipe.parent_2}'`
                );
            }
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

    try {
        transaction();
    } catch (error) {
        translateRecipeConstraint(error);
    }
}





/// ------------------------------------------------------------------------------------------------------ Monster Instances --- ///

//! ------------------------------------------------------------- |||||[ POST ]||||

function createMonster(species, nickname, playerId) {
    const player = db.prepare(`
        SELECT id
        FROM players
        WHERE id = ?
    `).get(playerId);

    if (!player) {
        throw notFound(`Player '${playerId}' does not exist`);
    }

    const encyclopediaMonster = db.prepare(`
        SELECT max_hp, atk, spd, aim
        FROM monster_encyclopedia
        WHERE name = ?
    `).get(species);

    // validation
    if (!encyclopediaMonster) {
        throw notFound(`Monster species '${species}' does not exist`);
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





function fuseMonsters(parent1Id, parent2Id, playerId) { //! ------------------------- Fuse two monsters
    const transaction = db.transaction(() => {
        if (parent1Id === parent2Id) {
            throw badRequest("A monster cannot be fused with itself");
        }

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
            throw notFound(`Monster ${parent1Id} not found or does not belong to player`);
        }
        if (!parent2) {
            throw notFound(`Monster ${parent2Id} not found or does not belong to player`);
        }

        // 2. Find a recipe using their species
        const recipes = db.prepare(`
            SELECT result
            FROM monster_recipes
            WHERE
                (parent_1 = ? AND parent_2 = ?)
                OR
                (parent_1 = ? AND parent_2 = ?)
        `).all(parent1.species,parent2.species,parent2.species,parent1.species);

        if (recipes.length > 1) {
            throw new Error("Multiple recipes exist for the same parent pair");
        }

        if (recipes.length === 0) {return null;} // if there is no combination

        const [recipe] = recipes;
        
        // 3. Create the resulting monster
        const resultMonster = createMonster(recipe.result, null,playerId);


        // 4. Delete the two original monsters
        const deleteMonster = db.prepare(`
            DELETE FROM monsters
            WHERE id = ? AND owner_id = ?
        `);


        const firstDelete = deleteMonster.run(parent1Id, playerId);
        const secondDelete = deleteMonster.run(parent2Id, playerId);

        if (firstDelete.changes !== 1 || secondDelete.changes !== 1) {
            throw new Error("Failed to consume fusion parents");
        }

        // 5. Get the complete monster information
        const getCreatedMonster = db.prepare(`
            SELECT
                monsters.id,
                monster_encyclopedia.name,
                monster_encyclopedia.display_name,
                monster_encyclopedia.tier,
                monster_encyclopedia.type,
                monsters.nickname,
                monster_encyclopedia.max_hp,
                monster_encyclopedia.atk,
                monster_encyclopedia.spd,
                monster_encyclopedia.aim,
                monsters.owner_id,
                monster_encyclopedia.image_path
            FROM monsters

            JOIN monster_encyclopedia
                ON monsters.species = monster_encyclopedia.name

            WHERE monsters.id = ?
        `).get(resultMonster.id);

        if (!getCreatedMonster) {
            throw new Error("Failed to load fusion result");
        }

        return getCreatedMonster;
    });

    return transaction();
}





//! ------------------------------------------------------------- |||||[ GET ]||||


function getMonstersByPlayerUuid(uuid) { //! ----- GET all by player uuid
    const transaction = db.transaction(() => {
        const player = db.prepare(`
            SELECT id
            FROM players
            WHERE uuid = ?
        `).get(uuid);

        if (!player) {
            return null;
        }

        return db.prepare(`
            SELECT
                monsters.id,
                monster_encyclopedia.name,
                monster_encyclopedia.display_name,
                monster_encyclopedia.type,
                monster_encyclopedia.tier,
                monsters.nickname,
                monster_encyclopedia.max_hp,
                monster_encyclopedia.atk,
                monster_encyclopedia.spd,
                monster_encyclopedia.aim,
                monsters.owner_id,
                monster_encyclopedia.image_path

            FROM monsters

            JOIN monster_encyclopedia
                ON monsters.species = monster_encyclopedia.name

            WHERE monsters.owner_id = ?
        `).all(player.id);
    });

    return transaction();
}



function getMonsterById(monsterId) { //! ----- GET a monster by Id and its recipes (with name and images)

    const monster = db.prepare(`
        SELECT
            monsters.id,
            monster_encyclopedia.name,
            monster_encyclopedia.display_name,
            monster_encyclopedia.type,
            monster_encyclopedia.tier,
            monsters.nickname,
            monster_encyclopedia.max_hp,
            monster_encyclopedia.atk,
            monster_encyclopedia.spd,
            monster_encyclopedia.aim,
            monster_encyclopedia.image_path
        FROM monsters

        JOIN monster_encyclopedia
            ON monsters.species = monster_encyclopedia.name

        WHERE monsters.id = ?
    `).get(monsterId);


    if (!monster) {return null;}


    const recipes = db.prepare(`
        SELECT
            p1.display_name AS parent1_display_name,
            p1.image_path AS parent1_image_path,
            p1.tier AS parent1_tier,

            p2.display_name AS parent2_display_name,
            p2.image_path AS parent2_image_path,
            p2.tier AS parent2_tier

        FROM monster_recipes r

        JOIN monster_encyclopedia p1
            ON r.parent_1 = p1.name

        JOIN monster_encyclopedia p2
            ON r.parent_2 = p2.name

        WHERE r.result = ?
    `).all(monster.name);


    monster.recipes = recipes.map(recipe => ({
        parent1: {
            display_name: recipe.parent1_display_name,
            image_path: recipe.parent1_image_path,
            tier: recipe.parent1_tier
        },

        parent2: {
            display_name: recipe.parent2_display_name,
            image_path: recipe.parent2_image_path,
            tier: recipe.parent2_tier
        }
    }));
    return monster;
}










module.exports = {
    uploadMonstersToEncyclopedia,
    getAllMonstersFromEncyclopedia,
    createMonster,
    getMonstersByPlayerUuid,
    getMonsterById,
    getAllRecipes,
    updateMonsterRecipes,
    fuseMonsters
};
