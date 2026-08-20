const express = require("express");

const monstersController = require("../controllers/monsters_controller");

const router = express.Router();


/// -- Monster Encyclopedia -- ///

// POST
router.post("/encyclopedia", monstersController.uploadMonstersToEncyclopedia);

// GET
router.get("/encyclopedia", monstersController.getAllMonstersFromEncyclopedia);




/// --- Monster Recipes --- ///

// GET
router.get("/recipes", monstersController.getAllRecipes);

// PUT
router.put("/recipes", monstersController.updateMonsterRecipes);





/// -- Monster Instances -- ///

// POST
router.post("/", monstersController.createMonster);

router.post("/fuse", monstersController.fuseMonsters);

//GET
router.get("/:uuid", monstersController.getMonstersByPlayerUuid);

router.get("/details/:id",monstersController.getMonsterInfoById)


module.exports = router;