import { readFileSync, writeFileSync, existsSync } from "node:fs";

// appid: nome do jogo (só para aparecer na mensagem)
const JOGOS = {
  985810: "Grand Chase",
};

// Normaliza para NFC e minúsculas: resolve o "á" escrito de forma decomposta.
const norm = (s) => s.normalize("NFC").toLowerCase();

// "notas" e "chá" como combinado; "teatime" e as xícaras pegam a série Tomo's Teatime.
// Mantive o acento em "chá" de propósito, para não casar com "chat", "chance" etc.
const TERMOS = ["notas", "chá", "teatime", "☕", "🍵"].map(norm);

// Deixe false no uso normal. Só ligue (true) para investigar o que a API está devolvendo.
const DIAGNOSTICO = false;

// true = só posts oficiais da Steam
const SO_ANUNCIOS_OFICIAIS = true;
const FEED_OFICIAL = "steam_community_announcements";

const STATE_FILE = "seen.json";
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const MODO_TESTE = process.env.TESTE === "true";

async function enviar(texto) {
  const r = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: texto.slice(0, 1900) }), // limite do Discord: 2000
  });
  if (!r.ok) console.error(`Discord respondeu HTTP ${r.status}`);
}

// Devolve TODOS os posts (novo -> antigo), sem filtrar
async function buscarPosts(appid) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=40&maxlength=300`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { appnews } = await res.json();
  return appnews?.newsitems ?? [];
}

const permitido = (item) =>
  !SO_ANUNCIOS_OFICIAIS || item.feedname === FEED_OFICIAL;

const bateNoFiltro = (titulo) => TERMOS.some((t) => norm(titulo).includes(t));

// O link certo é o próprio "url" que a API devolve para o post
// (steamstore-a.akamaihd.net/news/externalpost/...), que redireciona para o post correto.
const linkDoPost = (item) => item.url;

const dataBR = (unix) =>
  new Date(unix * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Recife" });

// ---------- MODO TESTE: manda o último post que bate no filtro ----------
if (MODO_TESTE) {
  for (const [appid, nome] of Object.entries(JOGOS)) {
    try {
      const todos = await buscarPosts(appid);
      const alvo = todos.filter(permitido).find((i) => bateNoFiltro(i.title));

      if (alvo) {
        await enviar(`🧪 TESTE: 🎮 **${nome}**: ${alvo.title}\n${linkDoPost(alvo)}`);
      } else {
        await enviar(`🧪 TESTE: nenhum post oficial de **${nome}** bate com o filtro nos últimos ${todos.length} posts da API.`);
      }

      if (DIAGNOSTICO) {
        const linhas = todos
          .slice(0, 8)
          .map((i) => `${dataBR(i.date)} · ${i.feedname} · ${i.title.slice(0, 70)}`)
          .join("\n");
        await enviar(`🔎 Últimos posts que a API devolveu para **${nome}**:\n${linhas}`);
      }
    } catch (e) {
      console.error(`Falha em ${nome}: ${e.message}`);
    }
  }
  process.exit(0); // não mexe no seen.json
}

// ---------- MODO NORMAL ----------
const seen = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : {};

for (const [appid, nome] of Object.entries(JOGOS)) {
  let items;
  try {
    items = (await buscarPosts(appid)).filter(permitido);
  } catch (e) {
    console.error(`Falha em ${nome}: ${e.message}`);
    continue;
  }

  // Primeira execução deste jogo: só registra o que já existe, sem avisar.
  const primeiraVez = !seen[appid];
  const jaVistos = new Set(seen[appid] ?? []);

  for (const item of items.reverse()) { // do mais antigo para o mais novo
    if (jaVistos.has(item.gid)) continue;
    jaVistos.add(item.gid);
    if (primeiraVez) continue;
    if (!bateNoFiltro(item.title)) continue;

    await enviar(`🎮 **${nome}**: ${item.title}\n${linkDoPost(item)}`);
  }

  seen[appid] = [...jaVistos].slice(-100); // guarda só os 100 mais recentes
}

writeFileSync(STATE_FILE, JSON.stringify(seen, null, 2));
