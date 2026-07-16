#!/usr/bin/env node
/**
 * list-soundcloud-tracks-api.mjs
 *
 * Utiliza la API v2 de SoundCloud para resolver un perfil de usuario,
 * listar todas sus pistas cargadas y guardar los resultados en un archivo JSON.
 * Admite el paso manual de un client_id o token de OAuth, y de lo contrario
 * intenta extraer de forma dinámica un client_id público desde soundcloud.com.
 *
 * Uso:
 *   node scripts/list-soundcloud-tracks-api.mjs [opciones]
 *
 * Opciones:
 *   -c, --client-id ID     SoundCloud client_id manual.
 *   -t, --oauth-token TKN  Token OAuth manual (Authorization: OAuth TKN).
 *   -u, --user-id ID       ID del usuario directo en SoundCloud (omite resolución).
 *   -p, --profile USER     Nombre o URL del perfil (default: iyari-c).
 *   -o, --output FILE      Ruta del archivo de salida (default: soundcloud-api-tracks.json).
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
const getArgValue = (flagAliases) => {
  for (const alias of flagAliases) {
    const idx = args.indexOf(alias);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
  }
  return null;
};

const manualClientId = getArgValue(["-c", "--client-id"]);
const oauthToken = getArgValue(["-t", "--oauth-token"]);
const manualUserId = getArgValue(["-u", "--user-id"]);
const profileInput = getArgValue(["-p", "--profile"]) || "iyari-c";
const outputFilename = getArgValue(["-o", "--output"]) || "soundcloud-api-tracks.json";

// Formatear la URL del perfil completo si sólo se pasa el username
const profileUrl = profileInput.startsWith("http")
  ? profileInput
  : `https://soundcloud.com/${profileInput}`;

/**
 * Intenta extraer dinámicamente un client_id público desde el frontend de SoundCloud.
 */
async function discoverClientId() {
  console.log("🔍 Intentando descubrir un SoundCloud client_id público...");
  try {
    const res = await fetch("https://soundcloud.com");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Buscar scripts cargados
    const scriptRegex = /<script[^>]+src=["'](https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']+\.js)["']/g;
    let match;
    const scriptUrls = [];
    while ((match = scriptRegex.exec(html)) !== null) {
      scriptUrls.push(match[1]);
    }

    if (scriptUrls.length === 0) {
      throw new Error("No se encontraron scripts CDN de SoundCloud en la página principal.");
    }

    console.log(`📂 Encontrados ${scriptUrls.length} scripts JS en el CDN. Buscando ID...`);

    // Buscar en los scripts el patrón client_id:"..."
    for (const url of scriptUrls.reverse()) { // Reversar suele encontrarlo más rápido en los bundles finales
      try {
        const scriptRes = await fetch(url);
        if (!scriptRes.ok) continue;
        const js = await scriptRes.text();
        const idMatch = js.match(/client_id\s*:\s*["']([a-zA-Z0-9]{32})["']/) ||
                        js.match(/client_id\s*=\s*["']([a-zA-Z0-9]{32})["']/);
        if (idMatch) {
          console.log(`✨ ¡Client ID público encontrado!: ${idMatch[1]}`);
          return idMatch[1];
        }
      } catch {
        // Ignorar errores de descarga individuales
      }
    }
  } catch (error) {
    console.warn(`⚠️ Error al descubrir client_id: ${error.message}`);
  }
  throw new Error("No se pudo extraer el client_id automáticamente. Proporciónalo usando --client-id.");
}

/**
 * Resuelve una URL de perfil en un objeto de usuario de SoundCloud.
 */
async function resolveProfile(url, clientId, token) {
  console.log(`🌐 Resolviendo perfil: ${url}`);
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
  const headers = token ? { Authorization: `OAuth ${token}` } : {};

  const res = await fetch(resolveUrl, { headers });
  if (!res.ok) {
    throw new Error(`Error de resolución de API de SoundCloud (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Obtiene de forma recursiva todas las pistas de un usuario.
 */
async function fetchUserTracks(userId, clientId, token) {
  let tracks = [];
  let nextUrl = `https://api-v2.soundcloud.com/users/${userId}/tracks?client_id=${clientId}&limit=100&linked_partitioning=1`;
  const headers = token ? { Authorization: `OAuth ${token}` } : {};
  let page = 1;

  console.log(`⬇️ Iniciando descarga de pistas para el usuario ID: ${userId}...`);

  while (nextUrl) {
    console.log(`   Página ${page}: solicitando pistas...`);
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) {
      throw new Error(`Error de API de SoundCloud al pedir pistas (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (data.collection && Array.isArray(data.collection)) {
      tracks = tracks.concat(data.collection);
      console.log(`   -> Recibidas ${data.collection.length} pistas (Total acumulado: ${tracks.length})`);
    }

    // Verificar si hay paginación. SoundCloud API v2 retorna next_href
    nextUrl = data.next_href ? `${data.next_href}&client_id=${clientId}` : null;
    page++;
  }

  return tracks;
}

// ── Función Principal ────────────────────────────────────────────────────────
async function main() {
  console.log("🎵 SoundCloud API Track Lister");
  console.log("════════════════════════════════════");

  try {
    const clientId = manualClientId || await discoverClientId();

    let userId = manualUserId;
    let username = "Usuario Directo";
    let permalinkUrl = profileUrl;

    if (!userId) {
      const userProfile = await resolveProfile(profileUrl, clientId, oauthToken);
      userId = userProfile.id;
      username = userProfile.username;
      permalinkUrl = userProfile.permalink_url;
      console.log(`👤 Usuario encontrado: "${username}" (ID: ${userId})`);
    }

    const rawTracks = await fetchUserTracks(userId, clientId, oauthToken);

    // Mapear pistas a un formato limpio y relevante
    const formattedTracks = rawTracks.map((item) => ({
      id: item.id,
      title: item.title,
      durationSeconds: Math.round((item.duration || 0) / 1000),
      durationFormatted: `${Math.floor((item.duration || 0) / 60000)}:${String(Math.floor(((item.duration || 0) % 60000) / 1000)).padStart(2, "0")}`,
      permalinkUrl: item.permalink_url,
      genre: item.genre || "None",
      createdAt: item.created_at,
      sharing: item.sharing, // public o private
      likesCount: item.likes_count ?? 0,
      playbackCount: item.playback_count ?? 0,
      description: item.description || null,
      artworkUrl: item.artwork_url || item.user?.avatar_url || null,
    }));

    const outputPath = resolve(import.meta.dirname, "..", outputFilename);
    await writeFile(outputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      user: { id: userId, username, permalinkUrl },
      summary: { totalTracks: formattedTracks.length },
      tracks: formattedTracks,
    }, null, 2));

    console.log("\n════ Resumen de Resultados ════════════");
    console.log(`✅ Total de pistas obtenidas: ${formattedTracks.length}`);
    console.log(`📂 Archivo generado en:       ${outputPath}`);
    
    if (formattedTracks.length > 0) {
      console.log("\n📋 Primeras 10 pistas encontradas:");
      console.table(formattedTracks.slice(0, 10).map((t) => ({
        ID: t.id,
        Título: t.title.length > 35 ? `${t.title.slice(0, 32)}...` : t.title,
        Duración: t.durationFormatted,
        Visibilidad: t.sharing.toUpperCase(),
        Género: t.genre,
      })));
    }
  } catch (error) {
    console.error(`\n❌ Error de ejecución: ${error.message}`);
    process.exit(1);
  }
}

main();
