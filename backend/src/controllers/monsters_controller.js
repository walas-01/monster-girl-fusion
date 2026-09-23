const monstersService = require("../services/monsters_service");
const playerService = require("../services/players_service")
const { badRequest, notFound } = require("../http/errors.js");
const {
    requireIntegerAtLeast,
    requirePositiveInteger,
    requirePositiveIntegerParameter,
    requireRecord,
    requireString,
    requireUuid
} = require("../http/validation.js");

function normalizeRecipes(recipes, field) {
    if (!Array.isArray(recipes)) {
        throw badRequest(`${field} must be an array`);
    }

    return recipes.map((recipe, index) => {
        requireRecord(recipe, `${field}[${index}]`);

        return {
            parent_1: requireString(recipe.parent_1, `${field}[${index}].parent_1`),
            parent_2: requireString(recipe.parent_2, `${field}[${index}].parent_2`)
        };
    });
}

function normalizeMonsterList(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw badRequest("Request body must be a non-empty array of monsters");
    }

    const names = new Set();

    return value.map((monster, index) => {
        requireRecord(monster, `monsters[${index}]`);

        const name = requireString(monster.name, `monsters[${index}].name`);

        if (names.has(name)) {
            throw badRequest(`Duplicate monster '${name}' in request`);
        }

        names.add(name);

        return {
            name,
            display_name: requireString(monster.display_name, `monsters[${index}].display_name`),
            recipes: normalizeRecipes(monster.recipes, `monsters[${index}].recipes`),
            image_path: requireString(monster.image_path, `monsters[${index}].image_path`),
            type: requireString(monster.type, `monsters[${index}].type`),
            tier: requireIntegerAtLeast(monster.tier, 0, `monsters[${index}].tier`),
            max_hp: requireIntegerAtLeast(monster.max_hp, 1, `monsters[${index}].max_hp`),
            spd: requireIntegerAtLeast(monster.spd, 0, `monsters[${index}].spd`),
            atk: requireIntegerAtLeast(monster.atk, 0, `monsters[${index}].atk`),
            aim: requireIntegerAtLeast(monster.aim, 0, `monsters[${index}].aim`)
        };
    });
}

/// ------------------------------------------------------------ Monster Encyclopedia --- ///

function uploadMonstersToEncyclopedia(req, res, next) {
    try {
        const monsterList = normalizeMonsterList(req.body);
        const {added,skipped} = monstersService.uploadMonstersToEncyclopedia(monsterList);

        res.status(added.length > 0 ? 201 : 200).json({
            message: "Monster added to the encyclopedia!",
            added: added,
            skipped: skipped
        });
    } catch (error) {
        next(error);
    }
}



function getAllMonstersFromEncyclopedia(req, res) {
    const monsters = monstersService.getAllMonstersFromEncyclopedia();

    res.status(200).json(monsters);
}


/// -------------------------------------------------------------------------- Monster Recipes --- ///

function getAllRecipes(req, res) {
    const recipes = monstersService.getAllRecipes();    

    res.status(200).json(recipes);
}


function updateMonsterRecipes(req, res, next) {
    try {
        requireRecord(req.body);

        const resultMonster = requireString(req.body.resultMonster, "resultMonster");
        const recipes = normalizeRecipes(req.body.recipes, "recipes");

        monstersService.updateMonsterRecipes(resultMonster, recipes);

        res.status(200).json({
            message: "Monster recipes updated successfully!"
        });
    } catch (error) {
        next(error);
    }
}



/// ------------------------------------------------------------------ Monster Instances --- ///
function createMonster(req, res, next) {
    try {
        requireRecord(req.body);

        const species = requireString(req.body.species, "species");
        const playerId = requirePositiveInteger(req.body.playerId, "playerId");
        const nickname = req.body.nickname ?? null;

        if (nickname !== null && typeof nickname !== "string") {
            throw badRequest("nickname must be a string or null");
        }

        const monster = monstersService.createMonster(species, nickname, playerId);

        res.status(201).json({
            message: ("Monster created for the player " +monster.playerId),
            monster: monster
        });

    }catch(error){
        next(error);
    }
}



function fuseMonsters(req, res, next) { //! ----------------------------------------------- Fuse
    try {
        requireRecord(req.body);

        const parent1Id = requirePositiveInteger(req.body.parent1Id, "parent1Id");
        const parent2Id = requirePositiveInteger(req.body.parent2Id, "parent2Id");
        const playerUuid = requireUuid(req.body.playerUuid, "playerUuid");

        if (parent1Id === parent2Id) {
            throw badRequest("A monster cannot be fused with itself");
        }

        const player = playerService.getPlayerByUuid(playerUuid);

        if (!player) {
            throw notFound("Player not found");
        }

        const monster = monstersService.fuseMonsters(parent1Id, parent2Id, player.id);

        if (monster === null) {
            throw badRequest("No recipe matches that fusion");
        }

        res.status(201).json({
            message: "Fusion successful!",
            monster
        });

    } catch (error) {
        next(error);
    }
}




function getMonstersByPlayerUuid(req, res, next) { //! ----------------------------------------------- GET monsters by playerUuid
    try{
        const uuid = requireUuid(req.params.uuid, "uuid");
        const monsters = monstersService.getMonstersByPlayerUuid(uuid);

        if (monsters === null) {
            throw notFound("Player not found");
        }

        res.status(200).json({
            monsters_found: monsters.length,
            monsters: monsters
        });
    }catch(err){
        next(err);
    }
}


function getMonsterInfoById(req,res,next){
    try{
        const monsterId = requirePositiveIntegerParameter(req.params.id, "Monster id");
        const monster = monstersService.getMonsterById(monsterId);

        if (!monster) {
            throw notFound("Monster not found");
        }

        res.status(200).json({
            monster: monster
        });
    }catch(err){
        next(err);
    }
} 






module.exports = {
    getMonsterInfoById,
    uploadMonstersToEncyclopedia,
    getAllMonstersFromEncyclopedia,
    createMonster,
    getMonstersByPlayerUuid,
    getAllRecipes,
    updateMonsterRecipes,
    fuseMonsters
};
