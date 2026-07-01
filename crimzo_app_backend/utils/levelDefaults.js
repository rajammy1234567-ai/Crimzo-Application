/** Fields applied to every new user at signup — free Level 1 (Rookie). */
const NEW_USER_LEVEL_FIELDS = {
  user_level: 1,
  equipped_level: 1,
  owned_levels: [1],
};

function normalizeUserLevelFields(user) {
  const owned = Array.isArray(user?.owned_levels) && user.owned_levels.length
    ? [...new Set(user.owned_levels.map(Number).filter((n) => n >= 1))].sort((a, b) => a - b)
    : [1];
  const userLevel = Math.max(1, Number(user?.user_level) || owned[owned.length - 1] || 1);
  const equipped = owned.includes(Number(user?.equipped_level))
    ? Number(user.equipped_level)
    : userLevel;
  return { user_level: userLevel, equipped_level: equipped, owned_levels: owned };
}

module.exports = {
  NEW_USER_LEVEL_FIELDS,
  normalizeUserLevelFields,
};