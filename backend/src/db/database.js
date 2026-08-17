const Database = require("better-sqlite3");

const db = new Database("game.db");

db.pragma("foreign_keys = ON"); //? this line enables foreign key usage, not on by default

db.exec(`
    CREATE TABLE IF NOT EXISTS monster_encyclopedia (
        name TEXT PRIMARY KEY NOT NULL UNIQUE,
        display_name TEXT NOT NULL,

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



db.exec(`
    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        uuid TEXT NOT NULL UNIQUE
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

module.exports = db;