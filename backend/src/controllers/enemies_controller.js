const enemiesService = require('../services/enemies_service');
const { conflict } = require("../http/errors.js");
const {
    requireNonnegativeInteger,
    requirePositiveInteger,
    requireRecord,
    requireString
} = require("../http/validation.js");


function getAllEnemies(req,res){
    const enemies = enemiesService.getAllEnemies();
    res.status(200).json({
        message: "Enemies retrieved successfully!",
        enemies: enemies
    });
}


function uploadEnemy(req, res, next) {
    try {
        requireRecord(req.body);

        const textFields = ["name", "displayName", "imagePath"];
        const normalizedEnemy = {...req.body};

        for (const field of textFields) {
            normalizedEnemy[field] = requireString(req.body[field], field);
        }

        const nonnegativeFields = ["difficulty", "atk", "spd", "aim"];

        for (const field of nonnegativeFields) {
            normalizedEnemy[field] = requireNonnegativeInteger(req.body[field], field);
        }

        normalizedEnemy.maxHp = requirePositiveInteger(req.body.maxHp, "maxHp");

        const newEnemy = enemiesService.uploadEnemy(normalizedEnemy);

        res.status(201).json({
            message: "New enemy added!",
            enemy: newEnemy
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return next(conflict("An enemy with that name already exists"));
        }

        next(error);
    }
}




module.exports = {
    getAllEnemies,
    uploadEnemy
};
