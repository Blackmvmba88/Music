const STOPWORDS = new Set("a al algo ante como con contra cuando de del desde donde el ella ellos en entre era es esta este fue ha hasta hay la las le les lo los mas me mi mis muy no nos para pero por porque que se sin sobre su sus te tu tus un una unos y ya yo bien cada siempre estoy nunca deja the that this these those you your yours youre they them their theyll she her hers he him his its was were been being have has had does did can could would should will just from into for with when who what why how every only more then than all any again around away here there dont didnt im is are be to of on at by up down out so if amor cancion coro intro verso outro yeah baby".split(" "));
const CONCEPTS: Record<string, string> = { noche: "night", nocturno: "night", luna: "moon", black: "night", negro: "night", dark: "night", oscuro: "night", oscuridad: "night", fuego: "fire", llama: "fire", humo: "smoke", ciudad: "city", urbano: "city", gente: "people", personas: "people", persona: "people", girl: "people", boy: "people", friend: "people", friends: "people", compa: "people", eyes: "people", kiss: "people", heart: "people", corazon: "people", pain: "people", dolor: "people", duele: "people", love: "people", quererte: "people", mujer: "people", hombre: "people", luz: "light", luces: "light", mar: "ocean", agua: "water", bubble: "water", bubbles: "water", playa: "beach", auto: "car", coche: "car", carro: "car", camino: "road", carretera: "road", carrera: "road", arbol: "tree", bosque: "forest", flor: "flower", flores: "flower", baile: "dance", bailar: "dance", musica: "music", guitarra: "guitar", escenario: "stage", multitud: "crowd", retrato: "portrait", pintura: "painting", arte: "art", belleza: "art", constelacion: "sky", constelaciones: "sky", mundo: "sky", lagrimas: "tears", cielo: "sky", sol: "sun" };

export const normalizeKeyword = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
export const sanitizeKeywords = (value: string[] | string, limit = 24) => [...new Set((Array.isArray(value) ? value : value.split(/[,;\n]/)).map(normalizeKeyword).filter((token) => token.length >= 3 && token.length <= 40 && !STOPWORDS.has(token)))].slice(0, limit);
export const extractTextKeywords = (text: string, limit = 18) => {
  const counts = new Map<string, number>();
  for (const token of text.split(/\s+/).map(normalizeKeyword)) {
    if (token.length < 4 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([token]) => token);
};
export const keywordMatch = (trackKeywords: string[], imageKeywords: string[]) => {
  const canonical = (values: string[]) => sanitizeKeywords(values, 100).map((token) => CONCEPTS[token] ?? token);
  const target = new Set(canonical(trackKeywords));
  const candidate = new Set(canonical(imageKeywords));
  const matches = [...target].filter((token) => candidate.has(token));
  return { matches, score: target.size && candidate.size ? matches.length / Math.sqrt(target.size * candidate.size) : 0 };
};
