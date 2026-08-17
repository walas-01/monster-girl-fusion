const monstersService = require("../services/monsters_service");

/// --- Monster Encyclopedia --- ///

function uploadMonstersToEncyclopedia(req, res) {
    const minsterList = req.body;

    // VALIDATION 
    // here I should validate the incoming data to match the type of variable and length


    const {added,skipped} = monstersService.uploadMonstersToEncyclopedia(minsterList);

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


/// --- Monster Recipes --- ///

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



/// --- Monster Instances --- ///
function createMonster(req, res) {
    const {species, nickname, playerId} = req.body;

    // VALIDATION 
    // here I should validate the incoming data to match the type of variable and length

    const monster = monstersService.createMonster(species, nickname, playerId);

    console.log("[post]: monster created with id: " + monster.id + " for player: " + monster.playerId );
    res.status(201).json({
        message: ("Monster created for the player" +monster.playerId),
        monster: monster
    });

}



function getAllMonstersForPlayer(req, res) {
    const {playerId} = req.body;

    const monsters = monstersService.getAllMonstersForPlayer(playerId);

    res.status(200).json({
        monsters_found: monsters.length,
        monsters: monsters
    });
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
    uploadMonstersToEncyclopedia,
    getAllMonstersFromEncyclopedia,
    createMonster,
    getAllMonstersForPlayer,
    getAllRecipes,
    updateMonsterRecipes,
    fuseMonsters
};