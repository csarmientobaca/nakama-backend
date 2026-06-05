// Source of truth for Nakama runtime code. Run `npm run build` to generate modules/index.js.
const CHARACTER_COLLECTION = "characters";
const CHARACTER_KEY = "primary";

const VALID_CLASSES_BY_RACE: Record<string, string[]> = {
  human: ["warrior", "ranger"],
  goblin: ["melee", "range"],
};

type CharacterStats = {
  strength: number;
  agility: number;
  stamina: number;
  intelligence: number;
  vitality: number;
};

type Character = {
  character_id: string;
  user_id: string;
  name: string;
  race: string;
  class: string;
  house: string | null;
  level: number;
  xp: number;
  gold: number;
  prestige: number;
  stats: CharacterStats;
  created_at: number;
};

type CreateCharacterPayload = {
  name?: unknown;
  race?: unknown;
  class?: unknown;
};

let InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  initializer.registerRpc("create_character", rpcCreateCharacter);
  initializer.registerRpc("get_character", rpcGetCharacter);
  initializer.registerRpc("get_dashboard", rpcGetDashboard);
  initializer.registerRpc("get_profile_state", rpcGetProfileState);

  logger.info("Grunt and Run backend milestone RPCs registered.");
};

function rpcCreateCharacter(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = requireUserId(ctx);
  const input = parseCreateCharacterPayload(payload);
  const name = normalizeName(input.name);
  const race = normalizeRace(input.race);
  const characterClass = normalizeClass(input.class);

  validateRaceAndClass(race, characterClass);

  assertNoExistingCharacter(nk, userId);

  const character: Character = {
    character_id: nk.uuidv4(),
    user_id: userId,
    name,
    race,
    class: characterClass,
    house: null,
    level: 1,
    xp: 0,
    gold: 0,
    prestige: 0,
    stats: getStartingStats(race, characterClass),
    created_at: Math.floor(Date.now() / 1000),
  };

  writeCharacter(nk, character);

  logger.info("Created character %s for user %s.", character.character_id, userId);
  return JSON.stringify({ character });
}

function rpcGetCharacter(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = requireUserId(ctx);
  const character = readCharacter(nk, userId);

  if (!character) {
    throw new Error("character_not_found");
  }

  return JSON.stringify({ character });
}

function rpcGetDashboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = requireUserId(ctx);
  const character = readCharacter(nk, userId);

  if (!character) {
    throw new Error("character_not_found");
  }

  return JSON.stringify(buildDashboardPayload(character));
}

function rpcGetProfileState(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const userId = requireUserId(ctx);
  const character = readCharacter(nk, userId);

  if (!character) {
    return JSON.stringify({
      has_character: false,
      has_house: false,
      character_status: "none",
      next_screen: "character_creation",
    });
  }

  return JSON.stringify({
    has_character: true,
    has_house: Boolean(character.house),
    character_status: "alive",
    next_screen: "dashboard",
    character,
    stats: character.stats,
    dashboard: buildDashboard(character),
  });
}

function parseCreateCharacterPayload(payload: string): CreateCharacterPayload {
  if (!payload) {
    throw new Error("payload_required");
  }

  try {
    return JSON.parse(payload) as CreateCharacterPayload;
  } catch (error) {
    throw new Error("invalid_json_payload");
  }
}

function requireUserId(ctx: nkruntime.Context): string {
  if (!ctx.userId) {
    throw new Error("authentication_required");
  }

  return ctx.userId;
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("name_required");
  }

  const name = value.trim();

  if (name.length < 3 || name.length > 24) {
    throw new Error("name_must_be_3_to_24_characters");
  }

  if (!/^[A-Za-z0-9 _-]+$/.test(name)) {
    throw new Error("name_contains_invalid_characters");
  }

  return name;
}

function normalizeRace(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("race_required");
  }

  return value.trim().toLowerCase();
}

function normalizeClass(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("class_required");
  }

  return value.trim().toLowerCase();
}

function validateRaceAndClass(race: string, characterClass: string): void {
  const allowedClasses = VALID_CLASSES_BY_RACE[race];

  if (!allowedClasses) {
    throw new Error("invalid_race");
  }

  if (allowedClasses.indexOf(characterClass) === -1) {
    throw new Error("class_not_allowed_for_race");
  }
}

function getStartingStats(race: string, characterClass: string): CharacterStats {
  const defaults: Record<string, Record<string, CharacterStats>> = {
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

function buildDashboardPayload(character: Character): {
  character: Character;
  stats: CharacterStats;
  dashboard: ReturnType<typeof buildDashboard>;
} {
  return {
    character,
    stats: character.stats,
    dashboard: buildDashboard(character),
  };
}

function buildDashboard(character: Character): {
  sections: string[];
  milestone: string;
  has_house: boolean;
} {
  return {
    sections: [
      "character_tree",
      "world_map",
      "market",
      "chat",
      "mission_board",
    ],
    milestone: "character_created",
    has_house: Boolean(character.house),
  };
}

function readCharacter(nk: nkruntime.Nakama, userId: string): Character | null {
  const records = nk.storageRead([
    {
      collection: CHARACTER_COLLECTION,
      key: CHARACTER_KEY,
      userId,
    },
  ]);

  if (records.length === 0) {
    return null;
  }

  return normalizeStoredCharacter(records[0].value as Character);
}

function normalizeStoredCharacter(character: Character): Character {
  if (typeof character.house === "undefined") {
    character.house = null;
  }

  return character;
}

function assertNoExistingCharacter(nk: nkruntime.Nakama, userId: string): void {
  if (readCharacter(nk, userId)) {
    throw new Error("character_already_exists");
  }
}

function writeCharacter(nk: nkruntime.Nakama, character: Character): void {
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
