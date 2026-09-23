const Database = require("better-sqlite3");
const { getDatabasePath } = require("../config.js");

const databasePath = getDatabasePath();
const db = new Database(databasePath, { timeout: 5_000 });

db.pragma("foreign_keys = ON"); //? this line enables foreign key usage, not on by default

const initializeDatabase = db.transaction(() => {
db.exec(`
    CREATE TABLE IF NOT EXISTS monster_encyclopedia (
        name TEXT PRIMARY KEY NOT NULL UNIQUE,
        display_name TEXT NOT NULL,

        type TEXT NOT NULL,
        tier INTEGER NOT NULL,

        max_hp INTEGER NOT NULL,
        atk INTEGER NOT NULL,
        spd INTEGER NOT NULL,
        aim INTEGER NOT NULL,

        image_path TEXT NOT NULL
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS monster_recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        parent_1 TEXT NOT NULL,
        parent_2 TEXT NOT NULL,
        result TEXT NOT NULL,

        FOREIGN KEY (parent_1)
            REFERENCES monster_encyclopedia(name),

        FOREIGN KEY (parent_2)
            REFERENCES monster_encyclopedia(name),

        FOREIGN KEY (result)
            REFERENCES monster_encyclopedia(name)
    );
`);

const conflictingRecipes = db.prepare(`
    SELECT
        MIN(parent_1, parent_2) AS first_parent,
        MAX(parent_1, parent_2) AS second_parent,
        COUNT(*) AS recipe_count
    FROM monster_recipes
    GROUP BY
        MIN(parent_1, parent_2),
        MAX(parent_1, parent_2)
    HAVING COUNT(*) > 1
`).all();

if (conflictingRecipes.length > 0) {
    const pairs = conflictingRecipes
        .map(recipe => `${recipe.first_parent} + ${recipe.second_parent}`)
        .join(", ");

    throw new Error(`Cannot enforce recipe uniqueness; conflicting parent pairs: ${pairs}`);
}

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS monster_recipes_unordered_parents
    ON monster_recipes (
        MIN(parent_1, parent_2),
        MAX(parent_1, parent_2)
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        uuid TEXT NOT NULL UNIQUE,

        monster_slots INTEGER NOT NULL DEFAULT 5,

        wood INTEGER NOT NULL DEFAULT 0,
        stone INTEGER NOT NULL DEFAULT 0,
        food INTEGER NOT NULL DEFAULT 0
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS monsters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        species TEXT NOT NULL,
        nickname TEXT,

        max_hp INTEGER NOT NULL,
        atk INTEGER NOT NULL,
        spd INTEGER NOT NULL,
        aim INTEGER NOT NULL,

        owner_id INTEGER NOT NULL,

        FOREIGN KEY (species)
            REFERENCES monster_encyclopedia(name),

        FOREIGN KEY (owner_id)
            REFERENCES players(id)
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS enemies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,

        difficulty INTEGER NOT NULL,

        max_hp INTEGER NOT NULL,
        atk INTEGER NOT NULL,
        spd INTEGER NOT NULL,
        aim INTEGER NOT NULL,

        image_path TEXT NOT NULL
    );
`);
});

try {
    initializeDatabase();
} catch (error) {
    db.close();
    throw error;
}

module.exports = db;
