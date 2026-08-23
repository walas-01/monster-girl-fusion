

export async function createPlayer(username) {
    const response = await fetch("/api/players", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username
        })
    });

    if (!response.ok) {
        throw new Error("Failed to create player");
    }
    return await response.json();
}



export async function getMonsterInfoById(monsterId) {
    const response = await fetch(`/api/monsters/details/${monsterId}`);

    if (!response.ok) {
        throw new Error("Failed to get monster info");
    }
    return await response.json();
}



export async function getPlayerMonsters(uuid) {
    const response = await fetch(`/api/monsters/${uuid}`);
    if (!response.ok) {
        throw new Error("Failed to get monsters");
    }

    return await response.json();
}

export async function getPlayerByUuid(uuid){
    const response = await fetch(`/api/players/${uuid}`);
    if (!response.ok) {
        throw new Error("Failed to get player data");
    }

    return await response.json();
}