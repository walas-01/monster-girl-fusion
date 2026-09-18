const enemiesService = require('../services/enemies_service');


function getAllEnemies(req,res){
    const enemies = enemiesService.getAllEnemies();
    res.status(200).json({
        message: "Enemies retrieved successfully!",
        enemies: enemies
    });
}


function uploadEnemy(req, res) {
    const enemy = req.body;

    // VALIDATION 
    // here I should validate the incoming data to match the type of variable and length

    const newEnemy = enemiesService.uploadEnemy(enemy);

    res.status(201).json({
        message: "New enemy added!",
        enemy: newEnemy
    });
}




module.exports = {
    getAllEnemies,
    uploadEnemy
};