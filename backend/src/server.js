// my imports
const db = require("./db/database.js");

const express = require("express");

// routes
const playersRoutes = require("./routes/players_routes.js");
const monstersRoutes = require("./routes/monsters_routes.js");

// Config and 
const app = express();
const PORT = 3001;
app.use(express.json()); // If JSON in the request body, parse it and make it available as req.body. 


// ENDPOINTS ----------



app.use("/api/monsters", monstersRoutes);
app.use("/api/players", playersRoutes);


// --------------------



app.listen(PORT, () => {
    console.log("[localhost:3001]: server up and running");
});