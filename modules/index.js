"use strict";
// Source of truth for Nakama runtime code. Run `npm run build` to generate modules/index.js.
var CHARACTER_COLLECTION = "characters";
var CHARACTER_KEY = "primary";
var VALID_CLASSES_BY_RACE = {
    human: ["warrior", "ranger"],
    goblin: ["melee", "range"],
};
var InitModule = function (ctx, logger, nk, initializer) {
    initializer.registerRpc("create_character", rpcCreateCharacter);
    initializer.registerRpc("get_character", rpcGetCharacter);
    initializer.registerRpc("get_dashboard", rpcGetDashboard);
    logger.info("Grunt and Run backend milestone RPCs registered.");
};
function rpcCreateCharacter(ctx, logger, nk, payload) {
    var userId = requireUserId(ctx);
    var input = parseCreateCharacterPayload(payload);
    var name = normalizeName(input.name);
    var race = normalizeRace(input.race);
    var characterClass = normalizeClass(input.class);
    validateRaceAndClass(race, characterClass);
    assertNoExistingCharacter(nk, userId);
    var character = {
        character_id: nk.uuidv4(),
        user_id: userId,
        name: name,
        race: race,
        class: characterClass,
        level: 1,
        xp: 0,
        gold: 0,
        prestige: 0,
        stats: getStartingStats(race, characterClass),
        created_at: Math.floor(Date.now() / 1000),
    };
    writeCharacter(nk, character);
    logger.info("Created character %s for user %s.", character.character_id, userId);
    return JSON.stringify({ character: character });
}
function rpcGetCharacter(ctx, logger, nk, payload) {
    var userId = requireUserId(ctx);
    var character = readCharacter(nk, userId);
    if (!character) {
        throw new Error("character_not_found");
    }
    return JSON.stringify({ character: character });
}
function rpcGetDashboard(ctx, logger, nk, payload) {
    var userId = requireUserId(ctx);
    var character = readCharacter(nk, userId);
    if (!character) {
        throw new Error("character_not_found");
    }
    return JSON.stringify({
        character: character,
        stats: character.stats,
        dashboard: {
            sections: [
                "character_tree",
                "world_map",
                "market",
                "chat",
                "mission_board",
            ],
            milestone: "character_created",
        },
    });
}
function parseCreateCharacterPayload(payload) {
    if (!payload) {
        throw new Error("payload_required");
    }
    try {
        return JSON.parse(payload);
    }
    catch (error) {
        throw new Error("invalid_json_payload");
    }
}
function requireUserId(ctx) {
    if (!ctx.userId) {
        throw new Error("authentication_required");
    }
    return ctx.userId;
}
function normalizeName(value) {
    if (typeof value !== "string") {
        throw new Error("name_required");
    }
    var name = value.trim();
    if (name.length < 3 || name.length > 24) {
        throw new Error("name_must_be_3_to_24_characters");
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(name)) {
        throw new Error("name_contains_invalid_characters");
    }
    return name;
}
function normalizeRace(value) {
    if (typeof value !== "string") {
        throw new Error("race_required");
    }
    return value.trim().toLowerCase();
}
function normalizeClass(value) {
    if (typeof value !== "string") {
        throw new Error("class_required");
    }
    return value.trim().toLowerCase();
}
function validateRaceAndClass(race, characterClass) {
    var allowedClasses = VALID_CLASSES_BY_RACE[race];
    if (!allowedClasses) {
        throw new Error("invalid_race");
    }
    if (allowedClasses.indexOf(characterClass) === -1) {
        throw new Error("class_not_allowed_for_race");
    }
}
function getStartingStats(race, characterClass) {
    var defaults = {
        human: {
            warrior: {
                strength: 12,
                agility: 8,
                stamina: 11,
                intelligence: 6,
                vitality: 10,
            },
            ranger: {
                strength: 8,
                agility: 12,
                stamina: 9,
                intelligence: 8,
                vitality: 9,
            },
        },
        goblin: {
            melee: {
                strength: 10,
                agility: 11,
                stamina: 9,
                intelligence: 6,
                vitality: 8,
            },
            range: {
                strength: 7,
                agility: 13,
                stamina: 8,
                intelligence: 8,
                vitality: 7,
            },
        },
    };
    return defaults[race][characterClass];
}
function readCharacter(nk, userId) {
    var records = nk.storageRead([
        {
            collection: CHARACTER_COLLECTION,
            key: CHARACTER_KEY,
            userId: userId,
        },
    ]);
    if (records.length === 0) {
        return null;
    }
    return records[0].value;
}
function assertNoExistingCharacter(nk, userId) {
    if (readCharacter(nk, userId)) {
        throw new Error("character_already_exists");
    }
}
function writeCharacter(nk, character) {
    nk.storageWrite([
        {
            collection: CHARACTER_COLLECTION,
            key: CHARACTER_KEY,
            userId: character.user_id,
            value: character,
            permissionRead: 1,
            permissionWrite: 0,
        },
    ]);
}
