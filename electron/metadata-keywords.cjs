const STOPWORDS = new Set(`a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eres esa ese eso esta estaba estas este esto fue ha hasta hay la las le les lo los mas me mi mis muy no nos o para pero por porque que se sin sobre su sus te tu tus un una uno unas unos y ya yo bien cada siempre estoy nunca deja the that this these those you your yours youre they them their theyll she her hers he him his its was were been being have has had does did can could would should will just from into for with when who what why how every only more then than all any again around away here there dont didnt im is are be to of on at by up down out so if amor cancion coro intro verso outro yeah baby oh ey ay`.split(/\s+/));
const CONCEPTS = { noche: "night", nocturno: "night", luna: "moon", black: "night", negro: "night", dark: "night", oscuro: "night", oscuridad: "night", fuego: "fire", llama: "fire", humo: "smoke", ciudad: "city", urbano: "city", gente: "people", personas: "people", persona: "people", girl: "people", boy: "people", friend: "people", friends: "people", compa: "people", eyes: "people", kiss: "people", heart: "people", corazon: "people", pain: "people", dolor: "people", duele: "people", love: "people", quererte: "people", mujer: "people", hombre: "people", luz: "light", luces: "light", mar: "ocean", agua: "water", bubble: "water", bubbles: "water", playa: "beach", auto: "car", coche: "car", carro: "car", camino: "road", carretera: "road", carrera: "road", arbol: "tree", bosque: "forest", flor: "flower", flores: "flower", baile: "dance", bailar: "dance", musica: "music", guitarra: "guitar", escenario: "stage", multitud: "crowd", retrato: "portrait", pintura: "painting", arte: "art", belleza: "art", constelacion: "sky", constelaciones: "sky", mundo: "sky", lagrimas: "tears", cielo: "sky", sol: "sun" };

const normalizeToken = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
const sanitizeKeywords = (value, limit = 24) => {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  return [...new Set(values.map(normalizeToken).filter((token) => token.length >= 3 && token.length <= 40 && !STOPWORDS.has(token)))].slice(0, limit);
};
const extractTextKeywords = (text, limit = 18) => {
  const counts = new Map();
  for (const token of String(text || "").split(/\s+/).map(normalizeToken)) {
    if (token.length < 4 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([token]) => token);
};
const scoreKeywordMatch = (left, right) => {
  const canonical = (values) => sanitizeKeywords(values, 100).map((token) => CONCEPTS[token] || token);
  const a = new Set(canonical(left));
  const b = new Set(canonical(right));
  if (!a.size || !b.size) return { score: 0, matches: [] };
  const matches = [...a].filter((token) => b.has(token));
  return { score: matches.length / Math.sqrt(a.size * b.size), matches };
};

module.exports = { extractTextKeywords, normalizeToken, sanitizeKeywords, scoreKeywordMatch };
