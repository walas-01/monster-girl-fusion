const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { once } = require("node:events");
const Database = require("better-sqlite3");

const { getDatabasePath, getPort } = require("../src/config.js");

const sourceDatabasePath = path.resolve(__dirname, "../game.db");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "monster-girl-fusion-"));
const testDatabasePath = path.join(temporaryDirectory, "game.db");
const previousDatabasePath = process.env.DATABASE_PATH;

fs.copyFileSync(sourceDatabasePath, testDatabasePath);
process.env.DATABASE_PATH = testDatabasePath;

const app = require("../src/app.js");
const db = require("../src/db/database.js");
const {
    HEADERS_TIMEOUT_MS,
    KEEP_ALIVE_TIMEOUT_MS,
    REQUEST_TIMEOUT_MS,
    closeHttpServer,
    createHttpServer,
    shutdownServer
} = require("../src/server.js");
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const requestLogs = [];
const errorLogs = [];

function captureStructuredLog(target, fallback, args) {
    if (args.length === 1 && typeof args[0] === "string") {
        try {
            const entry = JSON.parse(args[0]);

            if (typeof entry.event === "string" && entry.event.startsWith("request_")) {
                target.push(entry);
                return;
            }
        } catch {
            // Preserve non-JSON application output during tests.
        }
    }

    fallback(...args);
}

console.log = (...args) => captureStructuredLog(requestLogs, originalConsoleLog, args);
console.error = (...args) => captureStructuredLog(errorLogs, originalConsoleError, args);

const fixture = db.transaction(() => {
    const playerUuid = "00000000-0000-4000-8000-000000000001";
    const species = {
        parent1: "batch_one_parent_1",
        parent2: "batch_one_parent_2",
        result: "batch_one_result",
        noRecipe1: "batch_one_no_recipe_1",
        noRecipe2: "batch_one_no_recipe_2"
    };

    const player = db.prepare(`
        INSERT INTO players (username, uuid)
        VALUES (?, ?)
    `).run("Batch One Fixture", playerUuid);

    const insertSpecies = db.prepare(`
        INSERT INTO monster_encyclopedia (
            name,
            display_name,
            type,
            tier,
            max_hp,
            atk,
            spd,
            aim,
            image_path
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const name of Object.values(species)) {
        insertSpecies.run(name, name, "test", 0, 10, 1, 1, 1, "/test.png");
    }

    db.prepare(`
        INSERT INTO monster_recipes (parent_1, parent_2, result)
        VALUES (?, ?, ?)
    `).run(species.parent1, species.parent2, species.result);

    const insertMonster = db.prepare(`
        INSERT INTO monsters (species, nickname, max_hp, atk, spd, aim, owner_id)
        VALUES (?, NULL, 10, 1, 1, 1, ?)
    `);
    const ownerId = player.lastInsertRowid;

    return {
        playerUuid,
        species,
        parent1Id: insertMonster.run(species.parent1, ownerId).lastInsertRowid,
        parent2Id: insertMonster.run(species.parent2, ownerId).lastInsertRowid,
        noRecipe1Id: insertMonster.run(species.noRecipe1, ownerId).lastInsertRowid,
        noRecipe2Id: insertMonster.run(species.noRecipe2, ownerId).lastInsertRowid
    };
})();

let server;
let baseUrl;

before(async () => {
    server = createHttpServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (server) {
        await shutdownServer(server, { database: db, gracePeriodMs: 1_000 });
    }

    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    if (previousDatabasePath === undefined) {
        delete process.env.DATABASE_PATH;
    } else {
        process.env.DATABASE_PATH = previousDatabasePath;
    }
});

async function request(url, options) {
    const response = await fetch(`${baseUrl}${url}`, options);
    const body = await response.json();

    return { response, body };
}

function tableCounts() {
    return {
        players: db.prepare("SELECT COUNT(*) AS count FROM players").get().count,
        monsters: db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count,
        encyclopedia: db.prepare("SELECT COUNT(*) AS count FROM monster_encyclopedia").get().count,
        recipes: db.prepare("SELECT COUNT(*) AS count FROM monster_recipes").get().count,
        enemies: db.prepare("SELECT COUNT(*) AS count FROM enemies").get().count
    };
}

function catalogMonster(name, recipes = []) {
    return {
        name,
        display_name: name,
        recipes,
        image_path: "/test.png",
        type: "test",
        tier: 0,
        max_hp: 10,
        spd: 1,
        atk: 1,
        aim: 1
    };
}

function completedLogsFor(requestId) {
    return requestLogs.filter(entry =>
        entry.requestId === requestId && entry.event === "request_completed"
    );
}

function runBackendScript(script, databasePath, timeout = 10_000) {
    return spawnSync(process.execPath, ["-e", script], {
        cwd: path.resolve(__dirname, ".."),
        env: {
            ...process.env,
            DATABASE_PATH: databasePath
        },
        encoding: "utf8",
        timeout
    });
}

test("runtime configuration validates overrides", () => {
    assert.equal(getPort("0"), 0);
    assert.equal(getPort("3001"), 3001);
    assert.throws(() => getPort(""), /PORT must be an integer/);
    assert.throws(() => getPort("invalid"), /PORT must be an integer/);
    assert.throws(() => getPort("65536"), /PORT must be an integer/);
    assert.throws(() => getDatabasePath(" "), /DATABASE_PATH must not be empty/);
    assert.equal(getDatabasePath(testDatabasePath), path.resolve(testDatabasePath));
    assert.equal(path.resolve(db.name), path.resolve(testDatabasePath));
});

test("HTTP servers use the explicit timeout policy", () => {
    assert.equal(server.requestTimeout, REQUEST_TIMEOUT_MS);
    assert.equal(server.headersTimeout, HEADERS_TIMEOUT_MS);
    assert.equal(server.keepAliveTimeout, KEEP_ALIVE_TIMEOUT_MS);
});

test("graceful shutdown allows an active request to complete", async () => {
    let markRequestStarted;
    const requestStarted = new Promise(resolve => {
        markRequestStarted = resolve;
    });
    const lifecycleServer = createHttpServer((req, res) => {
        markRequestStarted();
        setTimeout(() => {
            res.statusCode = 200;
            res.end("complete");
        }, 50);
    });

    lifecycleServer.listen(0, "127.0.0.1");
    await once(lifecycleServer, "listening");

    const address = lifecycleServer.address();
    const responsePromise = fetch(`http://127.0.0.1:${address.port}`);
    await requestStarted;

    const shutdownPromise = closeHttpServer(lifecycleServer, { gracePeriodMs: 500 });
    const response = await responsePromise;
    const result = await shutdownPromise;

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "complete");
    assert.equal(result.forced, false);
});

test("shutdown destroys requests that exceed the grace period", async () => {
    let markRequestStarted;
    const requestStarted = new Promise(resolve => {
        markRequestStarted = resolve;
    });
    const lifecycleServer = createHttpServer(() => {
        markRequestStarted();
    });

    lifecycleServer.listen(0, "127.0.0.1");
    await once(lifecycleServer, "listening");

    const address = lifecycleServer.address();
    const responsePromise = fetch(`http://127.0.0.1:${address.port}`)
        .then(() => null)
        .catch(error => error);
    await requestStarted;

    const startedAt = Date.now();
    const result = await closeHttpServer(lifecycleServer, { gracePeriodMs: 25 });
    const requestError = await responsePromise;

    assert.equal(result.forced, true);
    assert.ok(Date.now() - startedAt < 1_000);
    assert.ok(requestError instanceof Error);
});

test("concurrent shutdown calls wait for one drain before closing the database", async () => {
    let markRequestStarted;
    const requestStarted = new Promise(resolve => {
        markRequestStarted = resolve;
    });
    const lifecycleServer = createHttpServer((req, res) => {
        markRequestStarted();
        setTimeout(() => res.end("complete"), 50);
    });
    const fakeDatabase = {
        open: true,
        closeCalls: 0,
        close() {
            this.closeCalls += 1;
            this.open = false;
        }
    };

    lifecycleServer.listen(0, "127.0.0.1");
    await once(lifecycleServer, "listening");

    const address = lifecycleServer.address();
    const responsePromise = fetch(`http://127.0.0.1:${address.port}`);
    await requestStarted;

    const firstShutdown = shutdownServer(lifecycleServer, {
        database: fakeDatabase,
        gracePeriodMs: 500
    });
    const secondShutdown = shutdownServer(lifecycleServer, {
        database: fakeDatabase,
        gracePeriodMs: 500
    });
    const response = await responsePromise;
    const [firstResult, secondResult] = await Promise.all([firstShutdown, secondShutdown]);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "complete");
    assert.deepEqual(firstResult, { forced: false });
    assert.deepEqual(secondResult, { forced: false });
    assert.equal(fakeDatabase.closeCalls, 1);
});

test("SQLite uses the documented busy timeout across processes", () => {
    assert.equal(db.pragma("busy_timeout", { simple: true }), 5_000);

    db.exec("BEGIN EXCLUSIVE");
    const startedAt = Date.now();
    let child;

    try {
        child = runBackendScript(
            "const db = require('./src/db/database.js'); db.close();",
            testDatabasePath,
            15_000
        );
    } finally {
        db.exec("ROLLBACK");
    }

    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /database is locked|SQLITE_BUSY/i);
    assert.ok(Date.now() - startedAt >= 4_000);
});

test("a fresh database initializes completely", () => {
    const directory = path.join(temporaryDirectory, "fresh-database");
    const databasePath = path.join(directory, "game.db");
    fs.mkdirSync(directory);

    const child = runBackendScript(
        "const db = require('./src/db/database.js'); db.close();",
        databasePath
    );

    assert.equal(child.status, 0, child.stderr);

    const freshDatabase = new Database(databasePath, { readonly: true });
    const tables = freshDatabase.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
    `).all().map(row => row.name);
    const indexes = freshDatabase.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'index'
    `).all().map(row => row.name);
    const integrity = freshDatabase.pragma("integrity_check", { simple: true });
    const foreignKeyErrors = freshDatabase.pragma("foreign_key_check");
    freshDatabase.close();

    for (const table of ["monster_encyclopedia", "monster_recipes", "players", "monsters", "enemies"]) {
        assert.ok(tables.includes(table), table);
    }

    assert.ok(indexes.includes("monster_recipes_unordered_parents"));
    assert.equal(integrity, "ok");
    assert.deepEqual(foreignKeyErrors, []);
});

test("registered signal handling drains the executable server and closes SQLite", () => {
    const directory = path.join(temporaryDirectory, "signal-database");
    const databasePath = path.join(directory, "game.db");
    fs.mkdirSync(directory);

    const child = runBackendScript(`
        const { registerShutdownHandlers, startServer } = require('./src/server.js');
        const server = startServer(0);
        registerShutdownHandlers(server);
        server.once('listening', () => process.emit('SIGTERM'));
    `, databasePath);

    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /server up and running/);
    assert.match(child.stdout, /"event":"shutdown_started","signal":"SIGTERM"/);
    assert.match(child.stdout, /"event":"shutdown_completed","signal":"SIGTERM"/);

    const closedDatabase = new Database(databasePath);
    assert.equal(closedDatabase.pragma("integrity_check", { simple: true }), "ok");
    closedDatabase.close();
});

test("the CommonJS server entry point starts and stops as an executable", async () => {
    const directory = path.join(temporaryDirectory, "entrypoint-database");
    const databasePath = path.join(directory, "game.db");
    fs.mkdirSync(directory);

    const child = spawn(process.execPath, ["src/server.js"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
            ...process.env,
            DATABASE_PATH: databasePath,
            PORT: "0"
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", data => {
        stdout += data.toString();
    });
    child.stderr.on("data", data => {
        stderr += data.toString();
    });

    const started = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Server entry point did not start: ${stderr}`));
        }, 5_000);

        timer.unref();
        child.stdout.on("data", () => {
            if (stdout.includes("server up and running")) {
                clearTimeout(timer);
                resolve();
            }
        });
        child.once("exit", code => {
            if (!stdout.includes("server up and running")) {
                clearTimeout(timer);
                reject(new Error(`Server entry point exited with ${code}: ${stderr}`));
            }
        });
    });

    try {
        await started;
        assert.match(stdout, /server up and running/);
    } finally {
        if (child.exitCode === null) {
            child.kill("SIGTERM");
        }
    }

    if (child.exitCode === null) {
        await once(child, "exit");
    }

    const executableDatabase = new Database(databasePath);
    assert.equal(executableDatabase.pragma("integrity_check", { simple: true }), "ok");
    executableDatabase.close();
});

test("failed initialization rolls back newly created schema objects", () => {
    const directory = path.join(temporaryDirectory, "failed-database");
    const databasePath = path.join(directory, "game.db");
    fs.mkdirSync(directory);

    const malformedDatabase = new Database(databasePath);
    malformedDatabase.exec(`
        CREATE TABLE monster_recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_1 TEXT NOT NULL,
            parent_2 TEXT NOT NULL,
            result TEXT NOT NULL
        );
        INSERT INTO monster_recipes (parent_1, parent_2, result)
        VALUES
            ('first', 'second', 'result-a'),
            ('second', 'first', 'result-b');
    `);
    malformedDatabase.close();

    const child = runBackendScript(
        "require('./src/db/database.js');",
        databasePath
    );

    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /Cannot enforce recipe uniqueness/);

    const rolledBackDatabase = new Database(databasePath, { readonly: true });
    const objects = rolledBackDatabase.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type IN ('table', 'index')
    `).all().map(row => row.name);
    rolledBackDatabase.close();

    assert.ok(objects.includes("monster_recipes"));
    assert.ok(!objects.includes("monster_encyclopedia"));
    assert.ok(!objects.includes("players"));
    assert.ok(!objects.includes("monsters"));
    assert.ok(!objects.includes("enemies"));
    assert.ok(!objects.includes("monster_recipes_unordered_parents"));
});

test("unknown API routes return a JSON 404", async () => {
    const { response, body } = await request("/api/not-a-route");
    const requestId = response.headers.get("x-request-id");

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assert.deepEqual(body, { message: "API endpoint not found" });
    assert.equal(completedLogsFor(requestId).length, 1);
    assert.equal(completedLogsFor(requestId)[0].route, "/api/*");
});

test("the player listing endpoint is not exposed", async () => {
    const { response, body } = await request("/api/players");

    assert.equal(response.status, 404);
    assert.deepEqual(body, { message: "API endpoint not found" });
});

test("security headers and server-owned request IDs are applied", async () => {
    const suppliedRequestId = "client-supplied-request-id";
    const beforeLogCount = requestLogs.length;
    const { response } = await request(`/api/players/${fixture.playerUuid}`, {
        headers: { "X-Request-ID": suppliedRequestId }
    });
    const requestId = response.headers.get("x-request-id");

    assert.equal(response.status, 200);
    assert.match(requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(requestId, suppliedRequestId);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok(response.headers.get("content-security-policy"));

    const matchingLogs = requestLogs
        .slice(beforeLogCount)
        .filter(entry => entry.requestId === requestId);

    assert.equal(matchingLogs.length, 1);
    assert.equal(matchingLogs[0].event, "request_completed");
    assert.equal(matchingLogs[0].method, "GET");
    assert.equal(matchingLogs[0].route, "/api/players/:uuid");
    assert.equal(matchingLogs[0].status, 200);
    assert.ok(matchingLogs[0].durationMs >= 0);
    assert.ok(!JSON.stringify(matchingLogs[0]).includes(fixture.playerUuid));
});

test("oversized JSON receives a correlated 413 response", async () => {
    const { response, body } = await request("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "x".repeat(110 * 1024) })
    });
    const requestId = response.headers.get("x-request-id");

    assert.equal(response.status, 413);
    assert.deepEqual(body, { message: "Request body too large" });
    const completionLogs = completedLogsFor(requestId);
    assert.equal(completionLogs.length, 1);
    assert.equal(completionLogs[0].status, 413);
    assert.equal(completionLogs[0].route, "/api/*");
    assert.ok(!JSON.stringify(completionLogs[0]).includes("xxxxx"));
});

test("malformed JSON returns a JSON 400", async () => {
    const { response, body } = await request("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
    });
    const requestId = response.headers.get("x-request-id");

    assert.equal(response.status, 400);
    assert.deepEqual(body, { message: "Invalid JSON body" });
    assert.equal(completedLogsFor(requestId).length, 1);
    assert.equal(completedLogsFor(requestId)[0].route, "/api/*");
});

test("untrusted errors return a generic JSON 500", async () => {
    const monstersService = require("../src/services/monsters_service.js");
    const originalGetAllRecipes = monstersService.getAllRecipes;

    monstersService.getAllRecipes = () => {
        const error = new Error(`private failure for ${fixture.playerUuid}`);
        error.status = 400;
        throw error;
    };

    try {
        const { response, body } = await request("/api/monsters/recipes");
        const requestId = response.headers.get("x-request-id");

        assert.equal(response.status, 500);
        assert.deepEqual(body, { message: "Internal server error" });
        const matchingErrorLogs = errorLogs.filter(entry =>
            entry.requestId === requestId && entry.event === "request_error"
        );

        assert.equal(completedLogsFor(requestId).length, 1);
        assert.equal(matchingErrorLogs.length, 1);
        assert.equal(matchingErrorLogs[0].errorType, "Error");
        assert.ok(!JSON.stringify(matchingErrorLogs[0]).includes(fixture.playerUuid));
        assert.ok(!JSON.stringify(matchingErrorLogs[0]).includes("private failure"));
    } finally {
        monstersService.getAllRecipes = originalGetAllRecipes;
    }
});

test("players can be created and restored by UUID", async () => {
    const created = await request("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Batch One Test" })
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.body.player.username, "Batch One Test");
    assert.equal(typeof created.body.player.uuid, "string");

    const restored = await request(`/api/players/${created.body.player.uuid}`);

    assert.equal(restored.response.status, 200);
    assert.equal(restored.body.player.uuid, created.body.player.uuid);

    const collection = await request(`/api/monsters/${created.body.player.uuid}`);
    assert.equal(collection.response.status, 200);
    assert.deepEqual(collection.body.monsters, []);

    const deletion = db.prepare("DELETE FROM players WHERE uuid = ?").run(created.body.player.uuid);
    assert.equal(deletion.changes, 1);

    const deletedCollection = await request(`/api/monsters/${created.body.player.uuid}`);
    assert.equal(deletedCollection.response.status, 404);
    assert.deepEqual(deletedCollection.body, { message: "Player not found" });
});

test("UUID endpoints distinguish malformed and absent players", async () => {
    const malformedPlayer = await request("/api/players/not-a-uuid");
    assert.equal(malformedPlayer.response.status, 400);
    assert.deepEqual(malformedPlayer.body, { message: "uuid must be a valid UUID" });

    const malformedCollection = await request("/api/monsters/not-a-uuid");
    assert.equal(malformedCollection.response.status, 400);
    assert.deepEqual(malformedCollection.body, { message: "uuid must be a valid UUID" });

    const uppercasePlayer = await request(`/api/players/${fixture.playerUuid.toUpperCase()}`);
    assert.equal(uppercasePlayer.response.status, 200);
    assert.equal(uppercasePlayer.body.player.uuid, fixture.playerUuid);

    const uppercaseCollection = await request(`/api/monsters/${fixture.playerUuid.toUpperCase()}`);
    assert.equal(uppercaseCollection.response.status, 200);
    assert.ok(Array.isArray(uppercaseCollection.body.monsters));

    const missingUuid = randomUUID();
    const missingPlayer = await request(`/api/players/${missingUuid}`);
    assert.equal(missingPlayer.response.status, 404);
    assert.deepEqual(missingPlayer.body, { message: "Player not found" });

    const missingCollection = await request(`/api/monsters/${missingUuid}`);
    assert.equal(missingCollection.response.status, 404);
    assert.deepEqual(missingCollection.body, { message: "Player not found" });

    const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count;
    const malformedFusion = await request("/api/monsters/fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            playerUuid: "not-a-uuid",
            parent1Id: fixture.parent1Id,
            parent2Id: fixture.parent2Id
        })
    });

    assert.equal(malformedFusion.response.status, 400);
    assert.deepEqual(malformedFusion.body, { message: "playerUuid must be a valid UUID" });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count, beforeCount);
});

test("monster details distinguish valid and absent IDs", async () => {
    const absentMonster = db.prepare("SELECT MAX(id) + 1000 AS id FROM monsters").get();

    const existing = await request(`/api/monsters/details/${fixture.parent1Id}`);
    assert.equal(existing.response.status, 200);
    assert.equal(existing.body.monster.id, fixture.parent1Id);

    const absent = await request(`/api/monsters/details/${absentMonster.id}`);
    assert.equal(absent.response.status, 404);
    assert.deepEqual(absent.body, { message: "Monster not found" });
});

test("player collection responses contain a monsters array", async () => {
    const { response, body } = await request(`/api/monsters/${fixture.playerUuid}`);

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.monsters));
    assert.equal(body.monsters_found, body.monsters.length);
});

test("invalid write requests do not change database row counts", async () => {
    const beforeCounts = tableCounts();
    const invalidRequests = [
        ["/api/players", "POST", []],
        ["/api/monsters", "POST", []],
        ["/api/enemies", "POST", []],
        ["/api/monsters/encyclopedia", "POST", []],
        ["/api/monsters/recipes", "PUT", []],
        ["/api/monsters/fuse", "POST", {}]
    ];

    for (const [url, method, body] of invalidRequests) {
        const result = await request(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        assert.equal(result.response.status, 400, `${method} ${url}`);
    }

    assert.deepEqual(tableCounts(), beforeCounts);
});

test("invalid mutation fields do not change database row counts", async () => {
    const beforeCounts = tableCounts();
    const invalidEnemy = {
        name: "batch_two_invalid_enemy",
        displayName: "Invalid Enemy",
        imagePath: "/test.png",
        difficulty: -1,
        maxHp: 10,
        atk: 1,
        spd: 1,
        aim: 1
    };
    const invalidCatalogMonster = catalogMonster("batch_two_invalid_catalog");
    invalidCatalogMonster.max_hp = 0;
    const invalidRequests = [
        ["/api/players", "POST", { username: " " }],
        ["/api/monsters", "POST", { species: " ", playerId: 1 }],
        ["/api/enemies", "POST", invalidEnemy],
        ["/api/monsters/encyclopedia", "POST", [invalidCatalogMonster]],
        ["/api/monsters/recipes", "PUT", {
            resultMonster: fixture.species.result,
            recipes: [{ parent_1: "", parent_2: fixture.species.parent2 }]
        }]
    ];

    for (const [url, method, body] of invalidRequests) {
        const result = await request(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        assert.equal(result.response.status, 400, `${method} ${url}`);
    }

    assert.deepEqual(tableCounts(), beforeCounts);
});

test("invalid catalog batches and recipe conflicts do not partially persist", async () => {
    const validName = "batch_two_rollback_catalog";
    const invalidMonster = catalogMonster("batch_two_rollback_invalid");
    invalidMonster.atk = -1;

    const invalidBatch = await request("/api/monsters/encyclopedia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([catalogMonster(validName), invalidMonster])
    });

    assert.equal(invalidBatch.response.status, 400);
    assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM monster_encyclopedia WHERE name = ?")
            .get(validName).count,
        0
    );

    const conflictingName = "batch_two_conflicting_catalog";
    const recipeConflict = await request("/api/monsters/encyclopedia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
            catalogMonster(conflictingName, [{
                parent_1: fixture.species.parent1,
                parent_2: fixture.species.parent2
            }])
        ])
    });

    assert.equal(recipeConflict.response.status, 409);
    assert.deepEqual(recipeConflict.body, {
        message: `A recipe already exists for '${fixture.species.parent1}' and '${fixture.species.parent2}'`
    });
    assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM monster_encyclopedia WHERE name = ?")
            .get(conflictingName).count,
        0
    );
});

test("known service failures retain 404 and 409 classifications", async () => {
    const owner = db.prepare("SELECT owner_id FROM monsters WHERE id = ?").get(fixture.parent1Id);
    const missingSpecies = await request("/api/monsters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            species: "missing-test-species",
            playerId: owner.owner_id,
            nickname: null
        })
    });

    assert.equal(missingSpecies.response.status, 404);
    assert.deepEqual(missingSpecies.body, {
        message: "Monster species 'missing-test-species' does not exist"
    });

    const missingRecipeResult = await request("/api/monsters/recipes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultMonster: "missing-test-species", recipes: [] })
    });

    assert.equal(missingRecipeResult.response.status, 404);

    const enemy = {
        name: "batch_two_duplicate_enemy",
        displayName: "Duplicate Enemy",
        imagePath: "/test.png",
        difficulty: 1,
        maxHp: 10,
        atk: 1,
        spd: 1,
        aim: 1
    };
    const createEnemy = () => request("/api/enemies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enemy)
    });

    assert.equal((await createEnemy()).response.status, 201);

    const duplicateEnemy = await createEnemy();
    assert.equal(duplicateEnemy.response.status, 409);
    assert.deepEqual(duplicateEnemy.body, {
        message: "An enemy with that name already exists"
    });
});

test("invalid recipe replacement rolls back", async () => {
    const getRecipes = db.prepare(`
        SELECT parent_1, parent_2
        FROM monster_recipes
        WHERE result = ?
        ORDER BY id
    `);
    const beforeRecipes = getRecipes.all(fixture.species.result);

    const { response } = await request("/api/monsters/recipes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            resultMonster: fixture.species.result,
            recipes: [
                { parent_1: fixture.species.parent1, parent_2: fixture.species.parent2 },
                { parent_1: "missing-test-species", parent_2: fixture.species.parent2 }
            ]
        })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(getRecipes.all(fixture.species.result), beforeRecipes);
});

test("encyclopedia upload status reflects whether rows were created", async () => {
    const firstMonster = catalogMonster("batch_two_catalog_1");
    const secondMonster = catalogMonster("batch_two_catalog_2");
    const upload = body => request("/api/monsters/encyclopedia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    const allNew = await upload([firstMonster]);
    assert.equal(allNew.response.status, 201);
    assert.deepEqual(allNew.body.added, [firstMonster.name]);

    const allExisting = await upload([firstMonster]);
    assert.equal(allExisting.response.status, 200);
    assert.deepEqual(allExisting.body.added, []);
    assert.deepEqual(allExisting.body.skipped, [firstMonster.name]);

    const mixed = await upload([firstMonster, secondMonster]);
    assert.equal(mixed.response.status, 201);
    assert.deepEqual(mixed.body.added, [secondMonster.name]);
    assert.deepEqual(mixed.body.skipped, [firstMonster.name]);
});

test("rejected fusion leaves both parents untouched", async () => {
    const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count;
    const { response } = await request("/api/monsters/fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            playerUuid: fixture.playerUuid,
            parent1Id: fixture.noRecipe1Id,
            parent2Id: fixture.noRecipe2Id
        })
    });

    assert.equal(response.status, 400);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count, beforeCount);
    assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM monsters WHERE id IN (?, ?)")
            .get(fixture.noRecipe1Id, fixture.noRecipe2Id).count,
        2
    );
});

test("successful fusion consumes both parents and creates one result", async () => {
    const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count;
    const { response, body } = await request("/api/monsters/fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            playerUuid: fixture.playerUuid,
            parent1Id: fixture.parent1Id,
            parent2Id: fixture.parent2Id
        })
    });

    assert.equal(response.status, 201);
    assert.equal(body.monster.name, fixture.species.result);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM monsters").get().count, beforeCount - 1);
    assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM monsters WHERE id IN (?, ?)")
            .get(fixture.parent1Id, fixture.parent2Id).count,
        0
    );
    assert.ok(db.prepare("SELECT id FROM monsters WHERE id = ?").get(body.monster.id));
});
