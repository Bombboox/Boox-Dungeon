export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const PLAYER_SPEED = 220;
export const PLAYER_RADIUS = 18;

export function spawnPlayer(id, x, y) {
    return {
        id,
        x: x - PLAYER_RADIUS,
        y: y - PLAYER_RADIUS,
        angle: 0,
        radius: PLAYER_RADIUS,
        color: randomColor(),
        input: {up: false, down: false, left:false, right: false, aim:0},
        lastInputSeq: 0,
    }
}

export function getPlayerSpawn(level) {

}

function randomColor() {
    const colors = ["#4aa3ff", "#ff6b6b", "#7CFF6B", "#ffd166", "#b388ff"]
    return colors[(Math.random() * colors.length) | 0];
}

export function applyInput(player, inputMsg) {
    if(!inputMsg || typeof inputMsg !== "object") return;

    const seq = inputMsg.seq | 0;
    if(seq <= player.lastInputSeq) return;

    player.lastInputSeq = seq;
    player.input.up = !!inputMsg.up;
    player.input.down = !!inputMsg.down;
    player.input.right = !!inputMsg.right;
    player.input.left = !!inputMsg.left;

    if(Number.isFinite(inputMsg.aim)) {
        let a = inputMsg.aim;
        if(a > Math.PI) a = ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
        if(a < -Math.PI) a = ((a - Math.PI) % (2 * Math.PI)) + Math.PI;
        player.input.aim = a;
    }
}

export function stepWorld(playersById, dt) {
    for (const p of playersById.values()) {
        let vx = 0;
        let vy = 0;
        
        if(p.input.up) vy -= 1;
        if(p.input.down) vy += 1;
        if(p.input.left) vx -= 1;
        if(p.input.right) vx += 1;
        
        
        if(vx !== 0 || vy !== 0) {
            const len = Math.hypot(vx, vy);
            vx /= len;
            vy /= len;
        }
        
        p.x += vx * PLAYER_SPEED * dt;
        p.y += vy * PLAYER_SPEED * dt;
        p.angle = p.input.aim;
    }
}

export function makeSnapshot(playersById, nowMs) {
    const players = {};
    for(const p of playersById.values()) {
        players[p.id] = {
            id: p.id,
            x: p.x,
            y: p.y,
            angle: p.angle,
            radius: p.radius,
            color: p.color,
        }
    }
    return {t: nowMs, players};
}