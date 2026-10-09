import { readFileSync, writeFileSync, existsSync } from "node:fs";

// appid: nome do jogo (só para aparecer na mensagem)
const JOGOS = {
  985810: "Grand Chase",
  // 570: "Dota 2",
};

// Termos buscados no título (sem diferenciar maiúscula/minúscula).
// Mantive o acento em "chá" de propósito, para não casar com "chat", "chance" etc.
const TERMOS = ["notas", "chá"];

const STATE_FILE = "seen.json";
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

const seen = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : {};

for (const [appid, nome] of Object.entries(JOGOS)) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=20&maxlength=300`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Falha em ${nome}: HTTP ${res.status}`);
    continue;
  }
  const { appnews } = await res.json();
  const items = appnews?.newsitems ?? [];

  // Primeira execução deste jogo: só registra o que já existe, sem avisar,
  // para você não receber 20 mensagens antigas de uma vez.
  const primeiraVez = !seen[appid];
  const jaVistos = new Set(seen[appid] ?? []);

  for (const item of items.reverse()) { // do mais antigo para o mais novo
    if (jaVistos.has(item.gid)) continue;
    jaVistos.add(item.gid);
    if (primeiraVez) continue;

    const titulo = item.title.toLowerCase();
    if (!TERMOS.some((t) => titulo.includes(t))) continue;

    const link = `https://store.steampowered.com/news/app/${appid}/view/${item.gid}`;
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🎮 **${nome}**: ${item.title}\n${link}` }),
    });
  }

  seen[appid] = [...jaVistos].slice(-100); // guarda só os 100 mais recentes
}

writeFileSync(STATE_FILE, JSON.stringify(seen, null, 2));
