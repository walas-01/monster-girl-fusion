const monstersService = require("../services/monsters_service");

/// ------------------------------------------------------------ Monster Encyclopedia --- ///

function uploadMonstersToEncyclopedia(req, res) {
    const monsterList = req.body;

    // VALIDATION 
    // here I should validate the incoming data to match the type of variable and length


    const {added,skipped} = monstersService.uploadMonstersToEncyclopedia(monsterList);

    res.status(201).json({
        message: "Monster added to the encyclopedia!",
        added: added,
        skipped: skipped
    });
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


function updateMonsterRecipes(req, res) {
    const {resultMonster, recipes} = req.body;

    monstersService.updateMonsterRecipes(resultMonster, recipes);

    res.status(200).json({
        message: "Monster recipes updated successfully!"
    });
}



/// ------------------------------------------------------------------ Monster Instances --- ///
function createMonster(req, res) {
    const {species, nickname, playerId} = req.body;

    try {
        const monster = monstersService.createMonster(species, nickname, playerId);

        console.log("[post]: monster created with id: " + monster.id + " for player: " + monster.playerId );
        res.status(201).json({
            message: ("Monster created for the player" +monster.playerId),
            monster: monster
        });

    }catch(error){
        res.status(400).json({
            error: "Failed to create monster",
            message: error.message
        });
    }
}



function getMonstersByPlayerUuid(req, res) {

    try{
        const { uuid } = req.params;

        const monsters = monstersService.getMonstersByPlayerUuid(uuid);

        console.log("[get]: getting monsters for player with uuid: " + uuid );
        res.status(200).json({
            monsters_found: monsters.length,
            monsters: monsters
        });
    }catch(err){
        console.error("[ERROR]: Failed to retrieve monsters for player with uuid: " + uuid, err);
        res.status(500).json({
            error: "Failed to retrieve monsters",
            message: err.message
        });
    }
}


function getMonsterInfoById(req,res){
    const {id} = req.params

    try{
        const monster = monstersService.getMonsterById(id);

        console.log("[get]: getting info for monster with id: " + id );
        res.status(200).json({
            monster: monster
        });
    }catch(err){
        console.error("[ERROR]: Failed to retrieve monster with id: " + id);
        res.status(500).json({
            error: "Failed to retrieve monster",
            message: err.message
        });
    }
} 


function fuseMonsters(req, res) {
    const {parent1Id, parent2Id, playerId} = req.body;

    try {
        const resultMonster = monstersService.fuseMonsters(parent1Id, parent2Id, playerId);  

        res.status(200).json({
            message: "Monsters fused successfully!",
            monster: resultMonster
        });
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
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