import express from "express";
import http from "http";
import {Server} from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import {C2S, S2C} from "./game/messages.js";
import {
    TICK_RATE,
    DT,
    spawnPlayer,
    spawnEnemy,
    applyInput,
    applySkillUpgrade,
    stepWorld,
    makeSnapshot,
    PLAYER_CLASSES,
} from "./game/world.js";
import { loadLdtkJsonSync, findPlayerSpawn, findEnemySpawns } from "./game/findSpawn.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "../client")));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: "*"},
});

const level_0_path = path.join(__dirname, "../client/levels/level_0.json");
const project = loadLdtkJsonSync(level_0_path);
const spawn_pos = findPlayerSpawn(project, "Level_0");
const enemySpawns = findEnemySpawns(project, "Level_0");

const entities = new Map();
enemySpawns.forEach((spawn, index) => {
    const enemy = spawnEnemy(`enemy:${index}`, spawn.x, spawn.y, {
        name: spawn.name,
        level: spawn.level,
    });
    entities.set(enemy.id, enemy);
});
const joinClassCycle = [PLAYER_CLASSES.BLADE, PLAYER_CLASSES.THROWER];
let joinClassIndex = 0;

io.on("connection", (socket) => {
    const id = socket.id;
    const playerClass = joinClassCycle[joinClassIndex % joinClassCycle.length];
    joinClassIndex += 1;
    const player = spawnPlayer(id, spawn_pos.x, spawn_pos.y, playerClass);
    entities.set(id, player);

    socket.emit(S2C.INIT, {meId: id, tickRate: TICK_RATE, playerClass});

    socket.on(C2S.INPUT, (msg) => {
        const p = entities.get(id);
        if(!p) return;
        applyInput(p, msg);
    });

    socket.on(C2S.SKILL_UPGRADE, (msg) => {
        const p = entities.get(id);
        if (!p || !msg || typeof msg !== "object") return;
        if (typeof msg.stat !== "string") return;
        applySkillUpgrade(p, msg.stat);
    });

    socket.on(C2S.CHAT, (rawMessage) => {
        const text = typeof rawMessage === "string" ? rawMessage.trim() : "";
        if (!text) return;

        io.emit(S2C.CHAT, {
            id,
            text: text.slice(0, 240),
            ts: Date.now(),
        });
    });

    socket.on("disconnect", () => {
        entities.delete(id);
        io.emit(S2C.DISCONNECT, {id});
    });
});

setInterval(() => {
    stepWorld(entities, DT);
    const snap = makeSnapshot(entities, Date.now());
    io.emit(S2C.SNAPSHOT, snap);
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
