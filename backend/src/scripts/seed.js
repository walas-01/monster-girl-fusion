const fs = require("fs");
const { uploadMonstersToEncyclopedia } = require("../services/monsters_service.js");

const monsters = JSON.parse(
    fs.readFileSync("./src/data/monsters.json", "utf8")
);

console.log(`Found ${monsters.length} monsters`);

const result = uploadMonstersToEncyclopedia(monsters);

console.log("Added:", result.added);
console.log("Skipped:", result.skipped);