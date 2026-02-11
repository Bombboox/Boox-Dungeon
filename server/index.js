import express from "express";
import http from "http";
import {Server} from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import {C2S, S2C} from "./game/messages.js";
import {TICK_RATE, DT, spawnPlayer, applyInput, stepWorld, makeSnapshot} from "./game/world.js";
import { loadLdtkJsonSync, findPlayerSpawn } from "./game/findSpawn.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "../client")));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: "*"},
});

const level_0_path = path.join(__dirname, "../client/levels/leveL_0.json");
const project = loadLdtkJsonSync(level_0_path)
const spawn_pos = findPlayerSpawn(project, "Level_0");

const players = new Map();

io.on("connection", (socket) => {
    const id = socket.id;
    const player = spawnPlayer(id, spawn_pos.x, spawn_pos.y);
    players.set(id, player);

    socket.emit(S2C.INIT, {meId: id, tickRate: TICK_RATE});

    socket.on(C2S.INPUT, (msg) => {
        const p = players.get(id);
        if(!p) return;
        applyInput(p, msg);
    });

    socket.on("disconnect", () => {
        players.delete(id);
        io.emit(S2C.DISCONNECT, {id});
    });
});

setInterval(() => {
    stepWorld(players, DT);
    const snap = makeSnapshot(players, Date.now());
    io.emit(S2C.SNAPSHOT, snap);
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});