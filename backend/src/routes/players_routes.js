const express = require("express");

const playerController = require("../controllers/players_controller");

const router = express.Router();


// POST
router.post("/", playerController.createPlayer);

// GET
router.get("/", playerController.getAllPlayers);



module.exports = router;