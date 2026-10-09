import { readFileSync, writeFileSync, existsSync } from "node:fs";

// appid: nome do jogo (só para aparecer na mensagem)
const JOGOS = {
  985810: "Grand Chase",
};

// Termos buscados no título (sem diferenciar maiúscula/minúscula).
// Mantive o acento em "chá" de propósito, para não casar com "chat", "chance" etc.
const TERMOS = ["notas", "chá"];

const STATE_FILE = "seen.json";
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const MODO_TESTE = process.env.TESTE === "true";

async function enviar(texto) {
  const r = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: texto }),
  });
  if (!r.ok) console.error(`Discord respondeu HTTP ${r.status}`);
}

async function buscarPosts(appid) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=20&maxlength=300`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { appnews } = await res.json();
  return appnews?.newsitems ?? []; // a API devolve do mais novo para o mais antigo
}

const bateNoFiltro = (titulo) =>
  TERMOS.some((t) => titulo.toLowerCase().includes(t));

const linkDoPost = (appid, gid) =>
  `https://store.steampowered.com/news/app/${appid}/view/${gid}`;

// ---------- MODO TESTE: manda o último post de cada jogo e sai ----------
if (MODO_TESTE) {
  for (const [appid, nome] of Object.entries(JOGOS)) {
    try {
      const items = await buscarPosts(appid);
      const alvo = items.find((i) => bateNoFiltro(i.title));
      if (alvo) {
        await enviar(`🧪 TESTE: 🎮 **${nome}**: ${alvo.title}\n${linkDoPost(appid, alvo.gid)}`);
      } else if (items[0]) {
        await enviar(
          `🧪 TESTE: nenhum dos últimos ${items.length} posts de **${nome}** bate com o filtro. Mais recente: ${items[0].title}\n${linkDoPost(appid, items[0].gid)}`
        );
      } else {
        await enviar(`🧪 TESTE: a API não retornou posts para **${nome}**.`);
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
    items = await buscarPosts(appid);
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

    await enviar(`🎮 **${nome}**: ${item.title}\n${linkDoPost(appid, item.gid)}`);
  }

  seen[appid] = [...jaVistos].slice(-100); // guarda só os 100 mais recentes
}

writeFileSync(STATE_FILE, JSON.stringify(seen, null, 2));
