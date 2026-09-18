const express = require("express");
const router = express.Router();

const enemiesController = require("../controllers/enemies_controller");


// GET
router.get("/",enemiesController.getAllEnemies);

// POST
router.post("/",enemiesController.uploadEnemy);





module.exports = router;