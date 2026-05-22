// Substitua o texto abaixo pela sua nova Chave de API gerada no Google Cloud Console
const YOUTUBE_API_KEY = "AIzaSyBhpdlWVIHHVDOg9rRBWMc5uyAAcEoqazA";
const SUPABASE_URL = "https://ybantvgcrelqwyvjkvsj.supabase.co";
const SUPABASE_KEY = "sb_publishable_YOnl_Qc5PQ5o9229nVx8Yg_ArNvGUHS";
const SUPABASE_TABLE = "ranking";
const SUPABASE_LYRICS_TABLE = "lyrics_cache";
const SUPABASE_VERIFIED_LYRICS_TABLE = "lyrics_verified";
const SUPABASE_REST_PATH = "/rest/v1";
const RANKING_STORAGE_KEY = "rankingLocal";
const LYRICS_CACHE_KEY = "lyricsCacheV2";
const RESULTADO_ATUAL_ID_KEY = "resultadoAtualId";
const RESULTADO_PROCESSADO_KEY = "ultimoResultadoProcessado";
const RESULTADO_REMOTO_KEY = "ultimoResultadoRemoto";
const LIMITE_RESULTADOS_BUSCA = 6;
const DURACAO_MINIMA_VIDEO_SEGUNDOS = 75;
const DURACAO_MAXIMA_VIDEO_SEGUNDOS = 900;

let ytPlayer = null;
let playerPronto = false;
let syncInterval = null;
let progressInterval = null;
let pontuacaoInterval = null;
let linhasSincronizadas = [];
let cantando = false;
let ultimaLinhaAtiva = -1;
let ultimoScrollLetraTs = 0;
let finalizacaoEmAndamento = false;
let letraAproximadaAtiva = false;
let letraAtualSemSync = "";
let duracaoBaseSyncAproximada = 0;

const yt = localStorage.getItem("musicaAudio");
const pagina = window.location.pathname;

function normalizarSupabaseUrl(url) {
    return String(url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

function obterProjectIdSupabase(url) {
    const match = normalizarSupabaseUrl(url).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1] : "";
}

function validarConfiguracaoSupabase() {
    const urlNormalizada = normalizarSupabaseUrl(SUPABASE_URL);
    const projectId = obterProjectIdSupabase(urlNormalizada);
    const usaChavePublica = /^sb_publishable_/i.test(SUPABASE_KEY);

    if (urlNormalizada !== SUPABASE_URL) {
        console.warn("[Supabase] A URL base deve ficar sem /rest/v1. Valor normalizado:", urlNormalizada);
    }

    if (!projectId) {
        console.error("[Supabase] URL invalida. Use o formato https://SEU_PROJECT_ID.supabase.co");
        return false;
    }

    if (!usaChavePublica) {
        console.error("[Supabase] A chave configurada nao parece ser publishable. Nao exponha service_role no frontend.");
        return false;
    }

    return true;
}

function montarUrlSupabase(path = "", query = "") {
    const base = `${normalizarSupabaseUrl(SUPABASE_URL)}${SUPABASE_REST_PATH}`;
    const caminho = path.startsWith("/") ? path : `/${path}`;
    return query ? `${base}${caminho}?${query}` : `${base}${caminho}`;
}

function criarErroSupabase(contexto, resposta, detalhes = "") {
    return new Error(`[Supabase:${contexto}] ${resposta.status} ${resposta.statusText}${detalhes ? ` - ${detalhes}` : ""}`);
}

function logErroPadrao(contexto, erro) {
    console.error(`[${contexto}]`, erro);
}

function gerarResultadoAtualId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return `resultado-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function obterHeadersSupabase(extra = {}) {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...extra
    };
}

function getRankingLocal() {
    try {
        return JSON.parse(localStorage.getItem(RANKING_STORAGE_KEY) || "[]");
    } catch (erro) {
        logErroPadrao("Ranking local", erro);
        return [];
    }
}

function salvarRankingLocal(registro) {
    const rankingAtual = getRankingLocal();
    rankingAtual.push(registro);
    rankingAtual.sort((a, b) => (b.pontuacao || 0) - (a.pontuacao || 0));
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankingAtual.slice(0, 50)));
}

function getLyricsCache() {
    try {
        const cache = JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY) || "{}");
        let alterado = false;

        Object.keys(cache).forEach((chave) => {
            if (String(chave).startsWith("busca__")) {
                delete cache[chave];
                alterado = true;
            }
        });

        if (alterado) {
            salvarLyricsCache(cache);
        }

        return cache;
    } catch (erro) {
        logErroPadrao("Cache local de letras", erro);
        return {};
    }
}

function salvarLyricsCache(cache) {
    try {
        localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(cache));
    } catch (erro) {
        logErroPadrao("Cache local de letras", erro);
    }
}

function criarChavesCacheLetra(titulo = "", artista = "", tentativas = []) {
    const chaves = new Set();

    function adicionar(song, artist = "") {
        const musica = normalizarComparacao(song);
        const cantor = normalizarComparacao(artist);
        if (!musica) return;
        chaves.add(`${musica}__${cantor}`);
    }

    adicionar(titulo, artista);
    tentativas.forEach((tentativa) => adicionar(tentativa.song, tentativa.artist));

    return Array.from(chaves);
}

function criarChavesCacheDiretas(videoId = "", buscaOriginal = "") {
    const chaves = new Set();
    const videoNorm = String(videoId || "").trim();

    if (videoNorm) chaves.add(`video__${videoNorm}`);

    return Array.from(chaves);
}

function combinarChavesCache(...listas) {
    return Array.from(
        new Set(
            listas.flat().filter(Boolean)
        )
    );
}

function buscarLetraNoCache(chaves = []) {
    const cache = getLyricsCache();
    for (const chave of chaves) {
        if (cache[chave]) return cache[chave];
    }
    return null;
}

function salvarLetraNoCache(chaves = [], payload = null) {
    if (!payload || chaves.length === 0) return;

    const cache = getLyricsCache();
    const registro = {
        ...payload,
        updatedAt: new Date().toISOString()
    };

    chaves.forEach((chave) => {
        cache[chave] = registro;
    });

    const enxuto = Object.fromEntries(
        Object.entries(cache)
            .sort((a, b) => String(b[1]?.updatedAt || "").localeCompare(String(a[1]?.updatedAt || "")))
            .slice(0, 250)
    );

    salvarLyricsCache(enxuto);
}

function tituloCompativelComBusca(tituloReferencia = "", tentativas = []) {
    const tituloNorm = normalizarComparacao(tituloReferencia);
    if (!tituloNorm) return false;

    return tentativas.some((tentativa) => {
        const musicaNorm = normalizarComparacao(tentativa.song || "");
        if (!musicaNorm) return false;
        if (tituloNorm === musicaNorm) return true;
        if (tituloNorm.includes(musicaNorm) || musicaNorm.includes(tituloNorm)) return true;

        const tokens = musicaNorm.split(" ").filter((token) => token.length > 2);
        if (tokens.length === 0) return false;

        const encontrados = tokens.filter((token) => tituloNorm.includes(token)).length;
        return encontrados === tokens.length && tokens.length >= 2;
    });
}

function artistaCompativelComBusca(artistaReferencia = "", tentativas = []) {
    const artistaNorm = normalizarComparacao(artistaReferencia);
    if (!artistaNorm) return false;

    const tentativasComArtista = tentativas
        .map((tentativa) => normalizarComparacao(tentativa.artist || ""))
        .filter(Boolean);

    if (tentativasComArtista.length === 0) return true;

    return tentativasComArtista.some((artistaTentativa) => {
        if (artistaNorm === artistaTentativa) return true;
        if (artistaNorm.includes(artistaTentativa) || artistaTentativa.includes(artistaNorm)) return true;

        const tokens = artistaTentativa.split(" ").filter((token) => token.length > 2);
        if (tokens.length === 0) return false;

        const encontrados = tokens.filter((token) => artistaNorm.includes(token)).length;
        return encontrados === tokens.length || encontrados >= Math.max(1, tokens.length - 1);
    });
}

function tituloEhGenerico(tituloReferencia = "") {
    const tituloNorm = normalizarComparacao(tituloReferencia);
    if (!tituloNorm) return true;

    const tokens = tituloNorm.split(" ").filter((token) => token.length > 2);
    if (tokens.length <= 1) return true;

    const comuns = new Set([
        "amor", "vagabundo", "saudade", "ficante", "bar", "vida", "saudade dela", "beijo"
    ]);

    return comuns.has(tituloNorm);
}

function cacheLetraEhCompativel(cacheHit, tituloLimpo, tentativas) {
    if (!cacheHit) return false;
    const tentativasAtivas = [{ song: tituloLimpo, artist: "" }, ...tentativas];
    const tituloPrincipal = tentativas[0]?.song || tituloLimpo;
    const tituloOk = !cacheHit.titulo || tituloCompativelComBusca(cacheHit.titulo, tentativasAtivas);
    const precisaValidarArtista = tentativas.some((tentativa) => (tentativa.artist || "").trim().length > 0);
    const artistaOk = !precisaValidarArtista || artistaCompativelComBusca(cacheHit.artista, tentativasAtivas);
    const duracaoEsperada = obterDuracaoEsperadaLetra();
    const duracaoCache = Number(cacheHit.duracao || cacheHit.duration || 0);
    const duracaoOk = !duracaoEsperada || !duracaoCache || Math.abs(duracaoCache - duracaoEsperada) <= 18;
    const tituloGenerico = tituloEhGenerico(tituloPrincipal);
    const artistaForte = !!cacheHit.artista && artistaCompativelComBusca(
        cacheHit.artista,
        tentativas.filter((tentativa) => (tentativa.artist || "").trim())
    );
    const temDuracaoComparavel = duracaoEsperada > 0 && duracaoCache > 0;
    const genericoOk = !tituloGenerico || artistaForte || (temDuracaoComparavel && duracaoOk);

    return tituloOk && artistaOk && duracaoOk && genericoOk;
}

function gerarFiltrosLetraVerificada(tentativas = []) {
    const filtros = [];
    const vistos = new Set();

    tentativas.forEach((tentativa) => {
        const titulo = limparSegmentoMusical(tentativa.song || "");
        const artista = limparSegmentoMusical(tentativa.artist || "");
        if (!titulo) return;

        const chave = `${titulo.toLowerCase()}|${artista.toLowerCase()}`;
        if (vistos.has(chave)) return;
        vistos.add(chave);

        const tituloEncoded = encodeURIComponent(`eq.${titulo}`);
        const artistaEncoded = encodeURIComponent(`eq.${artista}`);
        filtros.push(`and(titulo_norm.${tituloEncoded},artista_norm.${artistaEncoded},ativo.eq.true)`);
    });

    return filtros;
}

function gerarFiltrosArtistaLetraVerificada(tentativas = []) {
    const filtros = [];
    const vistos = new Set();

    tentativas.forEach((tentativa) => {
        const artista = limparSegmentoMusical(tentativa.artist || "");
        if (!artista) return;

        const artistaNorm = normalizarComparacao(artista);
        if (!artistaNorm || vistos.has(artistaNorm)) return;
        vistos.add(artistaNorm);

        filtros.push(`and(artista_norm.eq.${encodeURIComponent(artistaNorm)},ativo.eq.true)`);
    });

    return filtros;
}

function pontuarLetraVerificadaAproximada(item, tentativas = []) {
    const tituloItem = item?.titulo || "";
    const artistaItem = item?.artista || "";
    let melhorScore = 0;

    tentativas.forEach((tentativa) => {
        const tituloTentativa = limparSegmentoMusical(tentativa.song || "");
        const artistaTentativa = limparSegmentoMusical(tentativa.artist || "");
        let score = 0;

        score += pontuarCorrespondenciaTexto(tituloItem, tituloTentativa);
        score += Math.round(pontuarCorrespondenciaTexto(artistaItem, artistaTentativa) * 0.7);

        const tituloItemNorm = normalizarComparacao(tituloItem);
        const tituloTentativaNorm = normalizarComparacao(tituloTentativa);
        const tokensTentativa = extrairTokensRelevantesTexto(tituloTentativaNorm);
        const tokensEncontrados = tokensTentativa.filter((token) => tituloItemNorm.includes(token)).length;

        if (tokensTentativa.length > 0 && tokensEncontrados === tokensTentativa.length) {
            score += 35;
        } else if (tokensEncontrados > 0) {
            score += tokensEncontrados * 10;
        }

        if (score > melhorScore) {
            melhorScore = score;
        }
    });

    return melhorScore;
}

async function buscarLetraVerificadaSupabase(tentativas = []) {
    const filtros = gerarFiltrosLetraVerificada(tentativas);
    const campos = "titulo,artista,plain_lyrics,synced_lyrics,fonte,observacao,updated_at";

    if (filtros.length > 0) {
        const queryExata = `select=${campos}&or=(${filtros.join(",")})&order=updated_at.desc&limit=1`;
        const respostaExata = await fetchComTimeout(
            montarUrlSupabase(SUPABASE_VERIFIED_LYRICS_TABLE, queryExata),
            2500,
            {
                headers: obterHeadersSupabase()
            }
        );

        if (!respostaExata) {
            throw new Error("[Supabase:verified_lyrics_select] Timeout ao consultar letras verificadas");
        }

        if (!respostaExata.ok) {
            const erroTexto = await respostaExata.text();
            throw criarErroSupabase("verified_lyrics_select", respostaExata, erroTexto);
        }

        const dataExata = await respostaExata.json();
        if (Array.isArray(dataExata) && dataExata.length > 0) {
            const item = dataExata[0];
            return {
                titulo: item.titulo || "",
                artista: item.artista || "",
                plainLyrics: item.plain_lyrics || "",
                syncedLyrics: item.synced_lyrics || "",
                source: item.fonte || "verified",
                note: item.observacao || "",
                updatedAt: item.updated_at || ""
            };
        }
    }

    const filtrosArtista = gerarFiltrosArtistaLetraVerificada(tentativas);
    if (filtrosArtista.length === 0) return null;

    const queryAproximada = `select=${campos}&or=(${filtrosArtista.join(",")})&order=updated_at.desc&limit=25`;
    const respostaAproximada = await fetchComTimeout(
        montarUrlSupabase(SUPABASE_VERIFIED_LYRICS_TABLE, queryAproximada),
        2500,
        {
            headers: obterHeadersSupabase()
        }
    );

    if (!respostaAproximada) {
        throw new Error("[Supabase:verified_lyrics_select_fuzzy] Timeout ao consultar letras verificadas");
    }

    if (!respostaAproximada.ok) {
        const erroTexto = await respostaAproximada.text();
        throw criarErroSupabase("verified_lyrics_select_fuzzy", respostaAproximada, erroTexto);
    }

    const dataAproximada = await respostaAproximada.json();
    if (!Array.isArray(dataAproximada) || dataAproximada.length === 0) return null;

    const melhor = dataAproximada
        .map((item) => ({
            item,
            score: pontuarLetraVerificadaAproximada(item, tentativas)
        }))
        .sort((a, b) => b.score - a.score)[0];

    if (!melhor || melhor.score < 110) {
        return null;
    }

    return {
        titulo: melhor.item.titulo || "",
        artista: melhor.item.artista || "",
        plainLyrics: melhor.item.plain_lyrics || "",
        syncedLyrics: melhor.item.synced_lyrics || "",
        source: melhor.item.fonte || "verified",
        note: melhor.item.observacao || "",
        updatedAt: melhor.item.updated_at || ""
    };
}

async function salvarLetraVerificadaSupabase(payload = null) {
    if (!payload?.titulo) return false;

    const titulo = limparSegmentoMusical(payload.titulo || "");
    const artista = limparSegmentoMusical(payload.artista || "");
    if (!titulo) return false;

    const registro = {
        titulo,
        artista,
        titulo_norm: normalizarComparacao(titulo),
        artista_norm: normalizarComparacao(artista),
        plain_lyrics: payload.plainLyrics || "",
        synced_lyrics: payload.syncedLyrics || "",
        fonte: payload.source || "manual",
        observacao: payload.note || "",
        ativo: payload.active !== false,
        updated_at: new Date().toISOString()
    };

    try {
        const resposta = await fetch(montarUrlSupabase(SUPABASE_VERIFIED_LYRICS_TABLE), {
            method: "POST",
            headers: obterHeadersSupabase({
                Prefer: "resolution=merge-duplicates,return=minimal"
            }),
            body: JSON.stringify([registro])
        });

        if (!resposta.ok) {
            const erroTexto = await resposta.text();
            throw criarErroSupabase("verified_lyrics_upsert", resposta, erroTexto);
        }

        return true;
    } catch (erro) {
        logErroPadrao("Supabase verified lyrics upsert", erro);
        return false;
    }
}

async function buscarLetraSupabase(tentativas = [], chavesExtras = []) {
    const chaves = combinarChavesCache(
        chavesExtras,
        criarChavesCacheLetra("", "", tentativas)
    );
    if (chaves.length === 0) return null;

    const filtros = chaves.map((chave) => `cache_key.eq.${encodeURIComponent(chave)}`).join(",");
    const query = `select=cache_key,titulo,artista,plain_lyrics,synced_lyrics,source,updated_at&or=(${filtros})&order=updated_at.desc&limit=1`;
    const resposta = await fetchComTimeout(
        montarUrlSupabase(SUPABASE_LYRICS_TABLE, query),
        2500,
        {
            headers: obterHeadersSupabase()
        }
    );

    if (!resposta) {
        throw new Error("[Supabase:lyrics_select] Timeout ao consultar cache remoto de letras");
    }

    if (!resposta.ok) {
        const erroTexto = await resposta.text();
        throw criarErroSupabase("lyrics_select", resposta, erroTexto);
    }

    const data = await resposta.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const item = data[0];
    return {
        titulo: item.titulo || "",
        artista: item.artista || "",
        plainLyrics: item.plain_lyrics || "",
        syncedLyrics: item.synced_lyrics || "",
        source: item.source || "supabase",
        updatedAt: item.updated_at || ""
    };
}

async function salvarLetraSupabase(chaves = [], payload = null) {
    if (!payload || chaves.length === 0) return;

    const registros = chaves.map((cacheKey) => ({
        cache_key: cacheKey,
        titulo: payload.titulo || "",
        artista: payload.artista || "",
        plain_lyrics: payload.plainLyrics || "",
        synced_lyrics: payload.syncedLyrics || "",
        source: payload.source || "desconhecida",
        updated_at: new Date().toISOString()
    }));

    try {
        const resposta = await fetch(montarUrlSupabase(SUPABASE_LYRICS_TABLE), {
            method: "POST",
            headers: obterHeadersSupabase({
                Prefer: "resolution=merge-duplicates,return=minimal"
            }),
            body: JSON.stringify(registros)
        });

        if (!resposta.ok) {
            const erroTexto = await resposta.text();
            throw criarErroSupabase("lyrics_upsert", resposta, erroTexto);
        }
    } catch (erro) {
        logErroPadrao("Supabase lyrics upsert", erro);
    }
}

function obterInicioDoDiaISO() {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0);
    return inicio.toISOString();
}

async function inserirPontuacaoSupabase(registro) {
    const resposta = await fetch(montarUrlSupabase(SUPABASE_TABLE), {
        method: "POST",
        headers: obterHeadersSupabase({ Prefer: "return=representation" }),
        body: JSON.stringify([registro])
    });

    if (!resposta.ok) {
        const erroTexto = await resposta.text();
        throw criarErroSupabase("insert", resposta, erroTexto);
    }

    return resposta.json();
}

async function buscarRankingSupabase(modo = "livre") {
    const inicioDoDia = obterInicioDoDiaISO();
    const query = `select=nome,pontuacao,musica,modo,created_at&modo=eq.${encodeURIComponent(modo)}&created_at=gte.${encodeURIComponent(inicioDoDia)}&order=pontuacao.desc,created_at.asc&limit=10`;
    const resposta = await fetch(montarUrlSupabase(SUPABASE_TABLE, query), {
        headers: obterHeadersSupabase()
    });

    if (!resposta.ok) {
        const erroTexto = await resposta.text();
        throw criarErroSupabase("select", resposta, erroTexto);
    }

    return resposta.json();
}

function obterPontuacaoAtual() {
    const placar = document.getElementById("pontuacao");
    return parseInt((placar?.innerText || "").replace(/\D/g, ""), 10) || 0;
}

function gerarAvaliacao(pontuacao) {
    if (pontuacao >= 120) return "Performance brilhante! Voce dominou essa musica.";
    if (pontuacao >= 80) return "Mandou muito bem! Sua pontuacao ficou excelente.";
    if (pontuacao >= 40) return "Boa apresentacao! Da para buscar ainda mais pontos.";
    return "Voce ja comecou cantando. Continue praticando para subir no ranking.";
}

function montarRegistroResultado() {
    const pontuacao = localStorage.getItem("pontuacaoFinal");
    const nome = localStorage.getItem("nome") || "Cantor(a)";
    const musica = localStorage.getItem("musicaNome") || "Musica livre";
    const resultadoId = localStorage.getItem(RESULTADO_ATUAL_ID_KEY) || gerarResultadoAtualId();

    return {
        nome,
        musica,
        modo: "livre",
        pontuacao: parseInt(pontuacao || "0", 10) || 0,
        resultadoId,
        created_at: new Date().toISOString()
    };
}

async function sincronizarResultadoLivre() {
    const registro = montarRegistroResultado();
    const resultadoId = registro.resultadoId;
    const ultimoProcessado = localStorage.getItem(RESULTADO_PROCESSADO_KEY);
    const ultimoRemoto = localStorage.getItem(RESULTADO_REMOTO_KEY);

    if (ultimoProcessado === resultadoId) {
        return { remoto: ultimoRemoto === resultadoId, duplicado: true };
    }

    const { resultadoId: _resultadoId, ...registroPersistido } = registro;
    salvarRankingLocal(registroPersistido);
    localStorage.setItem(RESULTADO_PROCESSADO_KEY, resultadoId);

    try {
        await inserirPontuacaoSupabase(registroPersistido);
        localStorage.setItem(RESULTADO_REMOTO_KEY, resultadoId);
        return { remoto: true };
    } catch (erro) {
        logErroPadrao("Supabase ranking insert", erro);
        return { remoto: false, erro };
    }
}

async function sincronizarResultadoDesafio() {
    const j1 = localStorage.getItem("jogador1") || "Jogador 1";
    const j2 = localStorage.getItem("jogador2") || "Jogador 2";
    const pts1 = parseInt(localStorage.getItem("pontuacaoJ1") || "0", 10) || 0;
    const pts2 = parseInt(localStorage.getItem("pontuacaoJ2") || "0", 10) || 0;
    const musica = localStorage.getItem("musicaNome") || "Musica duelo";
    const resultadoId = localStorage.getItem(RESULTADO_ATUAL_ID_KEY) || gerarResultadoAtualId();

    const ultimoProcessado = localStorage.getItem("ultimoDesafioProcessado");
    if (ultimoProcessado === resultadoId) return { remoto: true, duplicado: true };

    const reg1 = { nome: j1, pontuacao: pts1, musica, modo: "desafio", created_at: new Date().toISOString() };
    const reg2 = { nome: j2, pontuacao: pts2, musica, modo: "desafio", created_at: new Date().toISOString() };

    salvarRankingLocal(reg1);
    salvarRankingLocal(reg2);
    localStorage.setItem("ultimoDesafioProcessado", resultadoId);

    try {
        await inserirPontuacaoSupabase(reg1);
        await inserirPontuacaoSupabase(reg2);
        return { remoto: true };
    } catch (erro) {
        logErroPadrao("Supabase ranking desafio insert", erro);
        return { remoto: false, erro };
    }
}

function renderizarRanking(lista, origem = "local") {
    const ul = document.getElementById("listaRanking");
    if (!ul) return;

    if (!Array.isArray(lista) || lista.length === 0) {
        ul.innerHTML = "<li>Nenhuma pontuacao registrada ainda.</li>";
        return;
    }

    ul.innerHTML = lista.map((item, index) => {
        const nome = escaparHtml(item.nome || "Cantor(a)");
        const musica = item.musica ? `<br><small>${escaparHtml(item.musica)}</small>` : "";
        const selo = index === 0 && origem === "supabase" ? " *" : "";
        return `<li><strong>${index + 1}. ${nome}</strong> - ${item.pontuacao || 0} pts${selo}${musica}</li>`;
    }).join("");
}

function inicializarPaginaResultado() {
    const nomeFinal = document.getElementById("nomeFinal");
    const pontuacaoFinal = document.getElementById("pontuacaoFinal");
    const avaliacao = document.getElementById("avaliacao");
    const modo = localStorage.getItem("modoAtual") || "livre";
    const musica = localStorage.getItem("musicaNome") || "";

    if (modo === "desafio") {
        const j1 = localStorage.getItem("jogador1") || "Jogador 1";
        const j2 = localStorage.getItem("jogador2") || "Jogador 2";
        const pts1 = parseInt(localStorage.getItem("pontuacaoJ1") || "0", 10);
        const pts2 = parseInt(localStorage.getItem("pontuacaoJ2") || "0", 10);

        if (nomeFinal) {
            nomeFinal.innerHTML = `Duelo finalizado:<br><small>${escaparHtml(musica)}</small><br><br><span style="font-size:1.3rem">${escaparHtml(j1)}: ${pts1} pts<br>${escaparHtml(j2)}: ${pts2} pts</span>`;
        }

        if (pontuacaoFinal) {
            if (pts1 > pts2) {
                pontuacaoFinal.innerHTML = `&#127942; Vencedor: ${escaparHtml(j1)}!`;
            } else if (pts2 > pts1) {
                pontuacaoFinal.innerHTML = `&#127942; Vencedor: ${escaparHtml(j2)}!`;
            } else {
                pontuacaoFinal.innerHTML = `&#129309; Empate!`;
            }
        }

        if (avaliacao) {
            avaliacao.innerText = "Que duelo incrivel! Ambos mandaram muito bem.";
            sincronizarResultadoDesafio().then((resultado) => {
                if (resultado.remoto) {
                    avaliacao.innerText += " Pontuacoes salvas no ranking online!";
                } else {
                    avaliacao.innerText += " Pontuacoes salvas localmente enquanto o ranking online nao responde.";
                }
            });
        }
    } else {
        const nome = localStorage.getItem("nome") || "Cantor(a)";
        const pontuacao = parseInt(localStorage.getItem("pontuacaoFinal") || "0", 10) || 0;

        if (nomeFinal) {
            nomeFinal.innerText = musica ? `${nome} cantou: ${musica}` : nome;
        }

        if (pontuacaoFinal) {
            pontuacaoFinal.innerHTML = `&#11088; ${pontuacao}`;
        }

        if (avaliacao) {
            avaliacao.innerText = gerarAvaliacao(pontuacao);
        }

        if (modo === "livre") {
            sincronizarResultadoLivre().then((resultado) => {
                if (!avaliacao) return;
                if (resultado.remoto) {
                    avaliacao.innerText += " Resultado sincronizado com o ranking online.";
                } else {
                    avaliacao.innerText += " Resultado salvo localmente enquanto o ranking online nao responde.";
                }
            });
        }
    }
}

let modoRankingAtual = "livre";

async function mudarAbaRanking(modo) {
    modoRankingAtual = modo;
    
    const btnLivre = document.getElementById("btnTabLivre");
    const btnDesafio = document.getElementById("btnTabDesafio");
    
    if (btnLivre && btnDesafio) {
        if (modo === "livre") {
            btnLivre.classList.add("ativa");
            btnDesafio.classList.remove("ativa");
        } else {
            btnLivre.classList.remove("ativa");
            btnDesafio.classList.add("ativa");
        }
    }
    
    await inicializarPaginaRanking();
}

async function inicializarPaginaRanking() {
    const local = getRankingLocal()
        .filter((item) => item.modo === modoRankingAtual)
        .sort((a, b) => (b.pontuacao || 0) - (a.pontuacao || 0))
        .slice(0, 10);

    renderizarRanking(local, "local");

    try {
        const remoto = await buscarRankingSupabase(modoRankingAtual);
        if (Array.isArray(remoto) && remoto.length > 0) {
            renderizarRanking(remoto, "supabase");
        }
    } catch (erro) {
        logErroPadrao("Supabase ranking select", erro);
    }
}

// ============================================================
// INICIALIZACAO GERAL (EVENTOS)
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
    validarConfiguracaoSupabase();

    let inputBusca = document.getElementById("buscaMusica");
    if (inputBusca) {
        inputBusca.addEventListener("keypress", (e) => {
            if (e.key === "Enter") buscarMusica();
        });
    }

    if (pagina.endsWith("resultado.html")) {
        inicializarPaginaResultado();
    }

    if (pagina.endsWith("ranking.html")) {
        inicializarPaginaRanking();
    }

    if (pagina.endsWith("vs.html")) {
        inicializarPaginaVS();
    }
});

// ============================================================
// INICIALIZACAO KARAOKE
// ============================================================
if (pagina.includes("karaoke.html")) {
    window.addEventListener("DOMContentLoaded", () => {
        let modo = localStorage.getItem("modoAtual");
        let nome = localStorage.getItem("nome");

        if (modo === "desafio") {
            let turno = localStorage.getItem("turnoAtual") || "1";
            nome = turno === "1" ? localStorage.getItem("jogador1") : localStorage.getItem("jogador2");
        }

        let musicaNome = localStorage.getItem("musicaNome");
        let musicaArtista = localStorage.getItem("musicaArtista");
        let musicaCanalYoutube = localStorage.getItem("musicaCanalYoutube");
        let musicaTituloOriginal = localStorage.getItem("musicaTituloOriginal");
        const metaMusica = extrairMetadadosMusica(musicaTituloOriginal || musicaNome || "", musicaCanalYoutube || musicaArtista || "");
        const musicaNomeExibicao = metaMusica.tituloExibicao || decodificarHtml(musicaNome || "");

        document.getElementById("nomeMusica").innerText = musicaNomeExibicao || "Nenhuma musica";
        document.getElementById("nomeUsuario").innerText = nome ? "Cantor: " + nome : "";

        if (musicaNomeExibicao && musicaNomeExibicao !== musicaNome) {
            localStorage.setItem("musicaNome", musicaNomeExibicao);
        }

        if (musicaNome) buscarLetra(musicaArtista || musicaCanalYoutube || "", musicaTituloOriginal || musicaNome);
        if (yt) carregarAPIYouTube();
    });
} else if (pagina.endsWith("resultado.html")) {
    window.addEventListener("DOMContentLoaded", () => {
        let modo = localStorage.getItem("modoAtual");
        let btnCantar = document.querySelector('a[href="modo-livre.html"]');

        if (btnCantar && modo === "desafio") {
            btnCantar.href = "desafio.html";
            btnCantar.innerHTML = "Novo duelo";
        }
    });
}

// ============================================================
// CARREGAR API YOUTUBE
// ============================================================
function carregarAPIYouTube() {
    if (window.YT && window.YT.Player) {
        criarPlayer();
        return;
    }

    let tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
    criarPlayer();
};

// ============================================================
// CRIAR PLAYER
// ============================================================
let indiceVideoAtual = -1;

function criarPlayer() {
    if (!yt) return;

    ytPlayer = new YT.Player("youtubePlayer", {
        width: "200",
        height: "200",
        videoId: yt,
        playerVars: {
            rel: 0
        },
        events: {
            onReady: (event) => {
                let iframe = event.target.getIframe();
                iframe.style.position = "absolute";
                iframe.style.top = "-9999px";
                iframe.style.left = "-9999px";

                playerPronto = true;
                recalcularSincronizacaoAproximadaSeNecessario();
                let loading = document.getElementById("loadingMusica");
                if (loading) {
                    loading.innerText = "Tudo pronto! Clique em Comecar a Cantar.";
                }
            },
            onStateChange: (event) => {
                if (event.data === YT.PlayerState.PLAYING) {
                    recalcularSincronizacaoAproximadaSeNecessario(true);
                }
                if (event.data === YT.PlayerState.ENDED) {
                    atualizarStatusSincronia("A musica terminou. Calculando seu resultado...");
                    finalizar(true);
                }
            },
            onError: (e) => {
                console.error("Erro no player do YouTube:", e.data);

                if (e.data == 150 || e.data == 101) {
                    let alternativos = JSON.parse(localStorage.getItem("musicasAlternativas") || "[]");
                    
                    if (indiceVideoAtual === -1) {
                        indiceVideoAtual = alternativos.indexOf(yt);
                        if (indiceVideoAtual === -1) indiceVideoAtual = 0;
                    }

                    if (indiceVideoAtual < alternativos.length - 1) {
                        indiceVideoAtual++;
                        let proximoVideo = alternativos[indiceVideoAtual];
                        console.log("Tentando video alternativo...", proximoVideo);

                        let loading = document.getElementById("loadingMusica");
                        if (loading) {
                            loading.innerText = "Video bloqueado. Buscando alternativa " + (indiceVideoAtual + 1) + " de " + alternativos.length + "...";
                        }
                        
                        if (cantando) e.target.loadVideoById(proximoVideo);
                        else e.target.cueVideoById(proximoVideo);
                        
                        localStorage.setItem("musicaAudio", proximoVideo);
                        return;
                    }
                }

                alert("Nenhum dos videos da busca permitiu reproducao. Volte e tente outra pesquisa.");
            }
        }
    });
}

// ============================================================
// CONTROLES DO PLAYER
// ============================================================
function cantar() {
    if (!playerPronto) {
        alert("Aguarde o carregamento...");
        return;
    }

    ytPlayer.playVideo();
    cantando = true;
    finalizacaoEmAndamento = false;

    document.getElementById("btnPlay").style.display = "none";
    document.getElementById("btnPausar").style.display = "inline-block";
    document.getElementById("loadingMusica").innerText = "Solta a voz!";
    atualizarStatusSincronia("A musica comecou. A linha destacada mostra a hora certa de entrar.");

    recalcularSincronizacaoAproximadaSeNecessario(true);
    iniciarSyncLetra();
    iniciarProgressBar();
    iniciarPontuacaoProgressiva();
}

function pausarResumir() {
    if (!ytPlayer) return;

    let btn = document.getElementById("btnPausar");

    if (ytPlayer.getPlayerState() === 1) {
        ytPlayer.pauseVideo();
        cantando = false;
        atualizarStatusSincronia("Musica pausada. Retome quando quiser.");
        if (btn) btn.innerHTML = "&#9654; Retomar";
    } else {
        ytPlayer.playVideo();
        cantando = true;
        atualizarStatusSincronia("Musica retomada. Acompanhe a linha destacada.");
        if (btn) btn.innerHTML = "&#9646;&#9646; Pausar";
    }
}

function finalizar(automatico = false) {
    if (finalizacaoEmAndamento) return;
    finalizacaoEmAndamento = true;
    cantando = false;

    if (!automatico && ytPlayer && typeof ytPlayer.stopVideo === "function") {
        ytPlayer.stopVideo();
    }

    let pontuacao = String(obterPontuacaoAtual());
    localStorage.setItem("pontuacaoFinal", pontuacao);

    let modo = localStorage.getItem("modoAtual");
    if (modo === "desafio") {
        let turno = localStorage.getItem("turnoAtual") || "1";
        if (turno === "1") {
            localStorage.setItem("pontuacaoJ1", pontuacao);
            localStorage.setItem("turnoAtual", "2");
            clearInterval(syncInterval);
            clearInterval(progressInterval);
            clearInterval(pontuacaoInterval);
            window.location.href = "vs.html";
            return;
        } else {
            localStorage.setItem("pontuacaoJ2", pontuacao);
        }
    }

    localStorage.setItem(RESULTADO_ATUAL_ID_KEY, gerarResultadoAtualId());
    clearInterval(syncInterval);
    clearInterval(progressInterval);
    clearInterval(pontuacaoInterval);
    window.location.href = "resultado.html";
}

// ============================================================
// BARRA DE PROGRESSO
// ============================================================
function iniciarProgressBar() {
    clearInterval(progressInterval);

    progressInterval = setInterval(() => {
        if (!ytPlayer) return;

        let atual = ytPlayer.getCurrentTime();
        let duracao = ytPlayer.getDuration();

        if (duracao > 0) {
            let pct = (atual / duracao) * 100;
            document.getElementById("audioProgress").style.width = pct + "%";
            document.getElementById("tempoAtual").innerText = formatarTempo(atual);
            document.getElementById("tempoDuracao").innerText = formatarTempo(duracao);
        }
    }, 500);
}

function formatarTempo(seg) {
    seg = Math.floor(seg);
    let m = Math.floor(seg / 60);
    let s = seg % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
}

function iniciarPontuacaoProgressiva() {
    clearInterval(pontuacaoInterval);

    const placar = document.getElementById("pontuacao");
    if (!placar) return;

    pontuacaoInterval = setInterval(() => {
        if (!cantando || !ytPlayer || ytPlayer.getPlayerState() !== 1) return;

        const atual = parseInt((placar.innerText || "").replace(/\D/g, ""), 10) || 0;
        placar.innerHTML = "&#11088; " + (atual + 1);
    }, 2500);
}

function atualizarStatusSincronia(texto) {
    const status = document.getElementById("statusSincronia");
    if (status) {
        status.innerText = texto;
    }
}

function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function decodificarHtml(texto) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(texto || "");
    return textarea.value;
}

function normalizarComparacao(texto) {
    return decodificarHtml(texto)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function removerPrefixoCanalProvavel(texto) {
    return decodificarHtml(texto || "")
        .replace(/^[\w@.]+\d[\w@.]*\s+-\s+/i, "")
        .replace(/^@[\w.]+\s+-\s+/i, "")
        .trim();
}

function pareceNomeDeCanal(texto) {
    const valor = normalizarComparacao(texto || "");
    if (!valor) return false;
    if (/(youtube|oficial|tv|canal|playback|karaoke)/.test(valor)) return true;
    if (!valor.includes(" ") && /\d/.test(valor)) return true;
    return false;
}

function partePareceExtraDeVideo(texto) {
    const valor = normalizarComparacao(texto || "");
    if (!valor) return false;
    if (pareceNomeDeCanal(valor)) return true;
    if (/\b(karaoke|videoke|playback|instrumental|cover|live|ao vivo|oficial|official|video|audio|lyrics|letra|status|shorts|tiktok|demo|demonstracao)\b/.test(valor)) {
        return true;
    }
    if (valor.split(" ").length <= 3 && /\d/.test(valor)) return true;
    return false;
}

function extrairMetadadosMusica(tituloVideo, canalYoutube = "") {
    const tituloBruto = decodificarHtml(tituloVideo || "");
    const canalBruto = decodificarHtml(canalYoutube || "");
    const buscaOriginal = localStorage.getItem("musicaBuscaOriginal") || "";
    const metaBusca = extrairMetadadosBusca(buscaOriginal);
    const tituloSemSufixoCanal = tituloBruto
        .replace(/\s+\|\s+[^|]+$/g, " ")
        .replace(/\s+\/\s+[^/]+$/g, " ");
    const tituloLimpo = normalizarTextoBusca(removerPrefixoCanalProvavel(tituloSemSufixoCanal));
    const canalLimpo = normalizarTextoBusca(canalBruto);
    const partes = tituloLimpo.split(/\s+-\s+/).map((parte) => parte.trim()).filter(Boolean);

    let artistaProvavel = "";
    let musicaProvavel = limparSegmentoMusical(tituloLimpo);

    if (partes.length >= 2) {
        const primeiraParte = limparSegmentoMusical(partes[0]);
        const extras = partes.slice(2);
        const ignorarExtras = extras.length > 0 && extras.every((parte) => partePareceExtraDeVideo(parte));
        const restoTitulo = limparSegmentoMusical(ignorarExtras ? partes[1] : partes.slice(1).join(" - "));
        const scorePadrao = (
            pontuarCorrespondenciaTexto(primeiraParte, metaBusca.artista)
            + pontuarCorrespondenciaTexto(primeiraParte, canalLimpo)
            + pontuarCorrespondenciaTexto(restoTitulo, metaBusca.musica)
        );
        const scoreInvertido = (
            pontuarCorrespondenciaTexto(primeiraParte, metaBusca.musica)
            + pontuarCorrespondenciaTexto(restoTitulo, metaBusca.artista)
            + pontuarCorrespondenciaTexto(restoTitulo, canalLimpo)
        );

        if (scoreInvertido >= scorePadrao + 25 && primeiraParte && restoTitulo) {
            artistaProvavel = restoTitulo;
            musicaProvavel = primeiraParte;
        } else if (pareceNomeDeCanal(primeiraParte) && restoTitulo) {
            artistaProvavel = "";
            musicaProvavel = restoTitulo;
        } else {
            artistaProvavel = primeiraParte;
            musicaProvavel = restoTitulo;
        }
    }

    if (!musicaProvavel) {
        musicaProvavel = limparSegmentoMusical(tituloLimpo);
    }

    if (!artistaProvavel && canalLimpo) {
        artistaProvavel = limparSegmentoMusical(canalLimpo);
    }

    const tituloExibicao = artistaProvavel && musicaProvavel
        ? `${artistaProvavel} - ${musicaProvavel}`
        : (musicaProvavel || tituloLimpo || tituloBruto);

    return {
        tituloBruto,
        tituloLimpo,
        tituloExibicao,
        canalBruto,
        canalLimpo,
        artistaProvavel,
        musicaProvavel
    };
}


function extrairTokensRelevantesBusca(termoBusca = "") {
    const metaBusca = extrairMetadadosBusca(termoBusca);
    const base = [metaBusca.buscaLimpa, metaBusca.artista, metaBusca.musica]
        .filter(Boolean)
        .join(" ");

    const ignorar = new Set([
        "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "para", "por",
        "com", "sem", "no", "na", "nos", "nas", "um", "uma"
    ]);

    return Array.from(new Set(
        normalizarComparacao(base)
            .split(" ")
            .filter((token) => token.length > 2 && !ignorar.has(token))
    ));
}

function contarTokensDaBuscaNoTexto(texto = "", tokensBusca = []) {
    const textoNorm = normalizarComparacao(texto);
    if (!textoNorm || tokensBusca.length === 0) return 0;
    return tokensBusca.filter((token) => textoNorm.includes(token)).length;
}

function extrairTokensRelevantesTexto(texto = "") {
    const ignorar = new Set([
        "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "para", "por",
        "com", "sem", "no", "na", "nos", "nas", "um", "uma"
    ]);

    return Array.from(new Set(
        normalizarComparacao(texto)
            .split(" ")
            .filter((token) => token.length > 2 && !ignorar.has(token))
    ));
}

function pontuarCorrespondenciaTexto(texto = "", referencia = "") {
    const textoNorm = normalizarComparacao(texto);
    const referenciaNorm = normalizarComparacao(referencia);

    if (!textoNorm || !referenciaNorm) return 0;
    if (textoNorm === referenciaNorm) return 120;
    if (textoNorm.includes(referenciaNorm) || referenciaNorm.includes(textoNorm)) return 80;

    const tokensReferencia = extrairTokensRelevantesTexto(referenciaNorm);
    if (tokensReferencia.length === 0) return 0;

    const encontrados = tokensReferencia.filter((token) => textoNorm.includes(token)).length;
    if (encontrados === 0) return 0;
    if (encontrados === tokensReferencia.length) return 65 + (encontrados * 4);
    return encontrados * 16;
}

function resultadoCombinaComBusca(meta, termoBusca = "") {
    const tokensBusca = extrairTokensRelevantesBusca(termoBusca);
    if (tokensBusca.length === 0) return true;

    const textoComparacao = [
        meta?.tituloBruto || "",
        meta?.tituloExibicao || "",
        meta?.artistaProvavel || "",
        meta?.musicaProvavel || "",
        meta?.canalBruto || ""
    ].join(" ");

    const encontrados = contarTokensDaBuscaNoTexto(textoComparacao, tokensBusca);
    const minimo = tokensBusca.length <= 2 ? tokensBusca.length : Math.max(2, tokensBusca.length - 1);

    return encontrados >= minimo;
}

function converterDuracaoIso8601ParaSegundos(iso = "") {
    const match = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
    if (!match) return 0;

    const horas = Number(match[1] || 0);
    const minutos = Number(match[2] || 0);
    const segundos = Number(match[3] || 0);
    return (horas * 3600) + (minutos * 60) + segundos;
}

function videoTemDuracaoAceitavel(item) {
    const duracao = Number(item?.contentDetails?.durationSec || 0);
    if (!duracao) return true;
    return duracao >= DURACAO_MINIMA_VIDEO_SEGUNDOS && duracao <= DURACAO_MAXIMA_VIDEO_SEGUNDOS;
}

async function enriquecerResultadosYoutube(items = []) {
    const ids = items
        .map((item) => item?.id?.videoId)
        .filter(Boolean);

    if (ids.length === 0) return items;

    const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(",")}&key=${YOUTUBE_API_KEY}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const porId = new Map(
            (data.items || []).map((item) => {
                const duracaoSec = converterDuracaoIso8601ParaSegundos(item?.contentDetails?.duration || "");
                return [item.id, { ...(item.contentDetails || {}), durationSec: duracaoSec }];
            })
        );

        return items.map((item) => ({
            ...item,
            contentDetails: porId.get(item?.id?.videoId) || item.contentDetails || null
        }));
    } catch (erro) {
        console.error("Erro ao carregar detalhes dos videos:", erro);
        return items;
    }
}

function pontuarResultadoMusica(item, termoBusca) {
    const meta = extrairMetadadosMusica(item?.snippet?.title || "", item?.snippet?.channelTitle || "");
    const tituloNorm = normalizarComparacao(meta.tituloExibicao || meta.tituloBruto);
    const termoNorm = normalizarComparacao(termoBusca);
    const tokensBusca = extrairTokensRelevantesBusca(termoBusca);
    const tokens = termoNorm.split(" ").filter((token) => token.length > 1);
    const duracao = Number(item?.contentDetails?.durationSec || 0);
    let score = 0;

    if (termoNorm && tituloNorm.includes(termoNorm)) score += 40;
    if (tokens.length > 0) {
        score += tokens.filter((token) => tituloNorm.includes(token)).length * 8;
    }
    if (tokensBusca.length > 0) {
        const textoComparacao = [
            meta.tituloBruto,
            meta.tituloExibicao,
            meta.artistaProvavel,
            meta.musicaProvavel,
            meta.canalBruto
        ].join(" ");
        const encontrados = contarTokensDaBuscaNoTexto(textoComparacao, tokensBusca);
        score += encontrados * 14;
        if (encontrados === tokensBusca.length) score += 50;
    }

    if (/\b(karaoke|playback|instrumental)\b/i.test(meta.tituloBruto)) score += 25;
    if (/\b(karaoke|playback|instrumental)\b/i.test(meta.canalBruto)) score += 10;
    if (meta.artistaProvavel && meta.musicaProvavel) score += 8;
    if (/\b(cover|live|ao vivo|dvd|show|clipe|studio sessions)\b/i.test(meta.tituloBruto)) score -= 20;

    if (duracao > 0) {
        if (duracao < DURACAO_MINIMA_VIDEO_SEGUNDOS) score -= 80;
        else if (duracao > DURACAO_MAXIMA_VIDEO_SEGUNDOS) score -= 25;
        else score += 18;

        if (duracao >= 120 && duracao <= 420) score += 8;
    }

    return { score, meta };
}

function renderizarPainelLetraSync(indiceAtual, progresso = 0, tempoAtual = 0) {
    const divLetra = document.getElementById("divLetra");
    if (!divLetra) return;

    divLetra.classList.add("letra-sync-painel");

    const anterior = indiceAtual > 0 ? linhasSincronizadas[indiceAtual - 1]?.texto || "" : "";
    const linhaAtualObj = indiceAtual >= 0 ? linhasSincronizadas[indiceAtual] || null : null;
    const atual = linhaAtualObj?.texto || "";
    const proxima = linhasSincronizadas[indiceAtual + 1]?.texto || "";
    const primeira = linhasSincronizadas[0]?.texto || "";
    const chaveAtual = String(indiceAtual);

    if (divLetra.dataset.activeIndex !== chaveAtual) {
        if (indiceAtual < 0) {
            divLetra.innerHTML = `
                <div class="sync-stack preparando">
                    <div class="sync-linha sync-linha-guia">Prepare-se</div>
                    <div class="sync-linha sync-linha-atual"><span class="texto-fill">${escaparHtml(primeira || "A letra vai aparecer aqui")}</span></div>
                    <div class="sync-linha sync-linha-proxima">${escaparHtml(linhasSincronizadas[1]?.texto || "")}</div>
                </div>
            `;
        } else {
            const htmlAtual = linhaAtualObj && linhaAtualObj.palavras?.length
                ? montarHtmlLinhaSync(linhaAtualObj, tempoAtual || linhaAtualObj.tempo)
                : `<span class="texto-fill">${escaparHtml(atual)}</span>`;
            divLetra.innerHTML = `
                <div class="sync-stack">
                    <div class="sync-linha sync-linha-anterior">${escaparHtml(anterior)}</div>
                    <div class="sync-linha sync-linha-atual">${htmlAtual}</div>
                    <div class="sync-linha sync-linha-proxima">${escaparHtml(proxima)}</div>
                </div>
            `;
        }

        divLetra.dataset.activeIndex = chaveAtual;
    }

    const linhaAtual = divLetra.querySelector(".sync-linha-atual");
    if (linhaAtual) {
        if (linhaAtualObj && linhaAtualObj.palavras?.length) {
            linhaAtual.innerHTML = montarHtmlLinhaSync(linhaAtualObj, tempoAtual);
        } else {
            linhaAtual.style.setProperty("--active-progress", `${progresso}%`);
        }
    }
}

function montarHtmlLinhaSync(linha, tempoAtual) {
    if (!linha?.palavras?.length) {
        return `<span class="texto-fill">${escaparHtml(linha?.texto || "")}</span>`;
    }

    return linha.palavras.map((palavra, indice) => {
        const inicio = palavra.tempo;
        const proximaPalavra = linha.palavras[indice + 1];
        const fim = proximaPalavra?.tempo || linha.tempoFinal || (inicio + 0.35);
        let classe = "palavra-sync";

        if (tempoAtual >= fim) {
            classe += " palavra-passada";
        } else if (tempoAtual >= inicio) {
            classe += " palavra-ativa";
        }

        return `<span class="${classe}">${escaparHtml(palavra.texto)}</span>`;
    }).join("");
}

// ============================================================
// ============================================================
// SINCRONIZACAO DA LETRA
// ============================================================
function iniciarSyncLetra() {
    clearInterval(syncInterval);
    ultimaLinhaAtiva = -1;
    ultimoScrollLetraTs = 0;

    const divLetra = document.querySelector(".letra");
    if (!divLetra) return;

    syncInterval = setInterval(() => {
        if (!ytPlayer || ytPlayer.getPlayerState() !== 1) return;

        if (linhasSincronizadas.length > 0) {
            let tempo = ytPlayer.getCurrentTime() + offsetLetra;
            let ativa = -1;

            for (let i = 0; i < linhasSincronizadas.length; i++) {
                if (tempo >= linhasSincronizadas[i].tempo) {
                    ativa = i;
                }
            }

            if (ativa < 0) {
                renderizarPainelLetraSync(-1, 0, tempo);
                atualizarStatusSincronia("Letra sincronizada pronta.");
                return;
            }

            const linhaAtual = linhasSincronizadas[ativa];
            const proximaLinha = linhasSincronizadas[ativa + 1] || null;
            const tempoAteProxima = proximaLinha
                ? Math.max(proximaLinha.tempo - linhaAtual.tempo, 0.8)
                : Math.max((linhaAtual.tempoFinal || linhaAtual.tempo + 3) - linhaAtual.tempo, 1.2);
            const duracaoCalculadaLinha = Math.max((linhaAtual.tempoFinal || linhaAtual.tempo) - linhaAtual.tempo, 1.2);
            const duracaoParaPreenchimento = Math.max(
                1,
                Math.min(tempoAteProxima, duracaoCalculadaLinha * 0.92)
            );
            const progresso = Math.max(0, Math.min(((tempo - linhaAtual.tempo) / duracaoParaPreenchimento) * 100, 100));

            renderizarPainelLetraSync(ativa, progresso, tempo);
            ultimaLinhaAtiva = ativa;
            atualizarStatusSincronia("Acompanhe a letra destacada abaixo.");
        } else if (divLetra.scrollTop < divLetra.scrollHeight - divLetra.offsetHeight) {
            atualizarStatusSincronia("Letra sem tempo exato. A rolagem esta automatica.");
            divLetra.scrollTop += 0.5;
        }
    }, 35);
}
async function buscarMusica() {
    let termo = document.getElementById("buscaMusica").value.trim();
    let div = document.getElementById("resultadosBusca");

    if (!termo) {
        alert("Digite uma musica!");
        return;
    }

    div.innerHTML = "Buscando...";
    localStorage.setItem("musicaBuscaOriginal", termo);
    localStorage.removeItem("musicaAudio");
    localStorage.removeItem("musicaSelecionada");
    localStorage.removeItem("musicaNome");
    localStorage.removeItem("musicaArtista");
    localStorage.removeItem("musicaCanalYoutube");
    localStorage.removeItem("musicaTituloOriginal");

    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(`"${termo}" karaoke instrumental`)}&type=video&videoEmbeddable=true&videoSyndicated=true&key=${YOUTUBE_API_KEY}&maxResults=18`;

    try {
        let res = await fetch(url);
        let data = await res.json();

        if (data.error || !data.items || data.items.length === 0) {
            mostrarResultadosFallback(div, termo);
        } else {
            const itensComDetalhes = await enriquecerResultadosYoutube(data.items);
            renderizarListaMusicas(itensComDetalhes, div);
        }
    } catch (erro) {
        console.error("Erro na busca:", erro);
        mostrarResultadosFallback(div, termo);
    }
}

function renderizarListaMusicas(items, div) {
    div.innerHTML = "";
    const termoBusca = document.getElementById("buscaMusica")?.value.trim() || "";
    const candidatosPontuados = items
        .filter((m) => m.id && m.id.videoId)
        .map((m) => ({ original: m, ...pontuarResultadoMusica(m, termoBusca) }))
        .sort((a, b) => b.score - a.score);

    const candidatosComDuracaoBoa = candidatosPontuados.filter((item) => videoTemDuracaoAceitavel(item.original));
    const baseOrdenada = candidatosComDuracaoBoa.length > 0 ? candidatosComDuracaoBoa : candidatosPontuados;

    let itensOrdenados = baseOrdenada
        .filter((item) => resultadoCombinaComBusca(item.meta, termoBusca))
        .slice(0, LIMITE_RESULTADOS_BUSCA)
        .map((item) => item.original);

    if (itensOrdenados.length === 0) {
        itensOrdenados = baseOrdenada
            .filter((item) => item.score >= 35)
            .slice(0, LIMITE_RESULTADOS_BUSCA)
            .map((item) => item.original);
    }

    if (itensOrdenados.length === 0) {
        div.innerHTML = "<p class='resultado-aviso'>Nao encontrei resultados parecidos com o que foi digitado. Tente informar artista e musica.</p>";
        return;
    }

    let alternativos = itensOrdenados.map((m) => m.id.videoId);
    localStorage.setItem("musicasAlternativas", JSON.stringify(alternativos));

    itensOrdenados.forEach((m) => {
        if (!m.id.videoId) return;

        const meta = extrairMetadadosMusica(m.snippet.title, m.snippet.channelTitle || "");
        const tituloTela = meta.tituloExibicao || meta.tituloBruto;

        let item = document.createElement("div");
        item.dataset.title = tituloTela;
        item.innerHTML = `<strong>${escaparHtml(tituloTela)}</strong>`;
        item.className = "resultado-item";

        item.onclick = () => {
            document.querySelectorAll(".resultado-item").forEach((el) => {
                el.classList.remove("selecionado");
                el.innerHTML = `<strong>${escaparHtml(el.dataset.title || "")}</strong>`;
            });

            item.classList.add("selecionado");
            item.innerHTML = `<strong>${escaparHtml(tituloTela)}</strong> <span class="resultado-ok">OK</span>`;
            selecionarMusica(meta, m.id.videoId, Number(m?.contentDetails?.durationSec || 0));
        };

        div.appendChild(item);
    });
}

function mostrarResultadosFallback(div, termo) {
    div.innerHTML = "<p class='resultado-aviso'>A chave da API falhou. Usando resultados de teste:</p>";

    let mockItems = [
        { id: { videoId: "M7lc1UVf-VE" }, snippet: { title: termo + " (Teste API Oficial)" } },
        { id: { videoId: "jNQXAC9IVRw" }, snippet: { title: termo + " (Teste Historico)" } },
        { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: termo + " (Never Gonna Give You Up)" } }
    ];

    renderizarListaMusicas(mockItems, div);
}

// ============================================================
// SALVAR MUSICA
// ============================================================
function selecionarMusica(meta, videoId, duracaoSegundos = 0) {
    const nomeExibicao = meta.tituloExibicao || meta.tituloLimpo || meta.tituloBruto || "Musica";
    const artistaBusca = meta.artistaProvavel || meta.canalLimpo || "Karaoke";
    const buscaOriginal = localStorage.getItem("musicaBuscaOriginal") || "";

    localStorage.setItem("musicaSelecionada", nomeExibicao);
    localStorage.setItem("musicaNome", nomeExibicao);
    localStorage.setItem("musicaArtista", artistaBusca);
    localStorage.setItem("musicaCanalYoutube", meta.canalBruto || "");
    localStorage.setItem("musicaTituloOriginal", meta.tituloBruto || nomeExibicao);
    localStorage.setItem("musicaBuscaOriginal", buscaOriginal);
    localStorage.setItem("musicaAudio", videoId);
    if (duracaoSegundos > 0) localStorage.setItem("musicaDuracao", String(duracaoSegundos));
    else localStorage.removeItem("musicaDuracao");
}

// ============================================================
// INICIAR MODO LIVRE
// ============================================================
function iniciarModoLivre() {
    let nome = document.getElementById("nome") ? document.getElementById("nome").value.trim() : "";
    let musica = localStorage.getItem("musicaAudio");

    if (!musica) {
        alert("Por favor, pesquise e selecione uma musica primeiro!");
        return;
    }

    if (nome) localStorage.setItem("nome", nome);
    else localStorage.removeItem("nome");

    localStorage.setItem("modoAtual", "livre");

    window.location.href = "karaoke.html";
}

// ============================================================
// MODO DESAFIO
// ============================================================
function irParaMusica() {
    let j1 = document.getElementById("jogador1");
    let j2 = document.getElementById("jogador2");

    if (j1 && j2) {
        let nome1 = j1.value.trim();
        let nome2 = j2.value.trim();

        if (!nome1 || !nome2) {
            alert("Por favor, digite o nome dos dois jogadores!");
            return;
        }

        localStorage.setItem("jogador1", nome1);
        localStorage.setItem("jogador2", nome2);

        window.location.href = "musica-desafio.html";
    }
}

function irParaVS() {
    let musica = localStorage.getItem("musicaAudio");
    if (!musica) {
        alert("Por favor, pesquise e selecione uma musica primeiro!");
        return;
    }
    localStorage.setItem("turnoAtual", "1");
    window.location.href = "vs.html";
}

function iniciarDuelo() {
    localStorage.setItem("modoAtual", "desafio");
    window.location.href = "karaoke.html";
}

function inicializarPaginaVS() {
    let j1 = localStorage.getItem("jogador1") || "Jogador 1";
    let j2 = localStorage.getItem("jogador2") || "Jogador 2";
    let j1El = document.getElementById("j1");
    let j2El = document.getElementById("j2");
    if (j1El) j1El.innerText = j1;
    if (j2El) j2El.innerText = j2;
    
    let turno = localStorage.getItem("turnoAtual") || "1";
    let infoTurno = document.getElementById("infoTurno"); 
    if (!infoTurno) {
        infoTurno = document.createElement("h2");
        infoTurno.id = "infoTurno";
        infoTurno.style.color = "var(--neon-green)";
        let container = document.querySelector(".container");
        if (container) {
            let botoes = container.querySelector(".botoes");
            if (botoes) container.insertBefore(infoTurno, botoes);
        }
    }
    
    let subTextoTurno = document.getElementById("subTextoTurno");
    if (!subTextoTurno) {
        subTextoTurno = document.createElement("p");
        subTextoTurno.id = "subTextoTurno";
        let container = document.querySelector(".container");
        if (container) {
            let botoes = container.querySelector(".botoes");
            if (botoes) container.insertBefore(subTextoTurno, botoes);
        }
    }
    
    let btnCantar = document.querySelector("button[onclick='iniciarDuelo()']");
    if (turno === "1") {
        infoTurno.innerText = `${j1} canta primeiro!`;
        subTextoTurno.innerText = "Preparem-se para o duelo.";
        if (btnCantar) btnCantar.innerText = `Comecar vez de ${j1}`;
    } else {
        let pts1 = localStorage.getItem("pontuacaoJ1") || "0";
        infoTurno.innerText = `Agora e a vez de ${j2}!`;
        subTextoTurno.innerHTML = `A pontuacao de ${j1} foi: <strong>${pts1} pts</strong>`;
        if (btnCantar) btnCantar.innerText = `Comecar vez de ${j2}`;
    }
}

// Variavel para atraso manual da letra
let offsetLetra = 0;
function normalizarTextoBusca(texto) {
    return decodificarHtml(removerPrefixoCanalProvavel(texto || ""))
        .replace(/\(.*?\)|\[.*?\]/g, " ")
        .replace(/\s+\|\s+[^|]+$/g, " ")
        .replace(/karaok[eê]|instrumental|version|vers[aã]o|cover|playback|com letra|lyrics?|audio oficial|video oficial|official video|official audio|studio sessions|ao vivo|live|demonstracao|demonstra[cç][aã]o|demo|shorts?|status|tiktok/gi, " ")
        .replace(/\|/g, " ")
        .replace(/\s+e\s+/gi, " & ")
        .replace(/[^a-zA-Z0-9À-ÿ\s\-&']/g, " ")
        .replace(/\s+/g, " ")
        .replace(/-\s*-/g, "-")
        .trim();
}

function limparSegmentoMusical(segmento) {
    return normalizarTextoBusca(segmento || "")
        .replace(/\b(part|part\.|feat|feat\.|ft|ft\.|participacao|participação|participacoes|participações|com|letra)\b.*$/i, " ")
        .replace(/\b(ritmo|versao|versão|video|vídeo|videoke|oficial|natanzinho|seresta|demo|demonstracao|demonstração|sample|trecho|playback|karaoke|lyrics?)\b.*$/i, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escaparRegex(texto) {
    return String(texto || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removerSufixoDuplicadoDaMusica(musica, artista = "") {
    const musicaLimpa = limparSegmentoMusical(musica || "");
    const artistaLimpo = limparSegmentoMusical(artista || "");

    if (!musicaLimpa || !artistaLimpo) return musicaLimpa;

    const musicaNorm = normalizarComparacao(musicaLimpa);
    const artistaNorm = normalizarComparacao(artistaLimpo);

    if (!musicaNorm || !artistaNorm || musicaNorm === artistaNorm) return musicaLimpa;

    const padraoFinal = new RegExp("(?:\\s+-\\s+|\\s+)" + escaparRegex(artistaNorm) + "$", "i");
    if (!padraoFinal.test(musicaNorm)) return musicaLimpa;

    const palavrasArtista = artistaLimpo.split(/\s+/).filter(Boolean);
    const palavrasMusica = musicaLimpa.split(/\s+/);
    if (palavrasMusica.length <= palavrasArtista.length) return musicaLimpa;

    return palavrasMusica.slice(0, palavrasMusica.length - palavrasArtista.length).join(" ").trim() || musicaLimpa;
}

function extrairMetadadosBusca(textoBusca) {
    const buscaLimpa = limparSegmentoMusical(textoBusca || "");
    const partes = buscaLimpa.split(/\s+-\s+/).map((parte) => parte.trim()).filter(Boolean);

    if (partes.length >= 2) {
        return {
            buscaLimpa,
            artista: limparSegmentoMusical(partes[0]),
            musica: limparSegmentoMusical(partes.slice(1).join(" - "))
        };
    }

    return {
        buscaLimpa,
        artista: "",
        musica: buscaLimpa
    };
}

function gerarTentativasBuscaLetra(canalYoutube, tituloVideo) {
    const meta = extrairMetadadosMusica(tituloVideo, canalYoutube);
    const tituloLimpo = meta.tituloExibicao || meta.tituloLimpo;
    const canalLimpo = meta.canalLimpo;
    const buscaOriginal = localStorage.getItem("musicaBuscaOriginal") || "";
    const metaBusca = extrairMetadadosBusca(buscaOriginal);
    const musicaProvavel = removerSufixoDuplicadoDaMusica(meta.musicaProvavel, meta.artistaProvavel || canalLimpo);
    const musicaBusca = removerSufixoDuplicadoDaMusica(metaBusca.musica, metaBusca.artista);
    const tentativas = [];
    const vistos = new Set();

    function adicionar(song, artist) {
        const musica = limparSegmentoMusical(song || "");
        const artista = limparSegmentoMusical(artist || "");
        const chave = `${musica.toLowerCase()}|${artista.toLowerCase()}`;

        if (!musica || vistos.has(chave)) return;
        vistos.add(chave);

        tentativas.push({
            song: musica,
            artist: artista,
            query: artista ? `${artista} ${musica}` : musica
        });
    }

    const partes = tituloLimpo.split("-").map((p) => p.trim()).filter(Boolean);

    adicionar(musicaBusca, metaBusca.artista);
    adicionar(metaBusca.buscaLimpa, "");
    adicionar(musicaProvavel, meta.artistaProvavel);
    adicionar(musicaProvavel, canalLimpo);
    adicionar(musicaProvavel, "");
    adicionar(tituloLimpo, meta.artistaProvavel);
    adicionar(tituloLimpo, "");

    if (partes.length >= 2) {
        const primeira = limparSegmentoMusical(partes[0]);
        const resto = removerSufixoDuplicadoDaMusica(partes.slice(1).join(" - "), primeira || meta.artistaProvavel);
        adicionar(resto, primeira);
        adicionar(resto, "");
        adicionar(primeira, resto);
        adicionar(primeira, "");
    }

    if (partes.length >= 3) {
        adicionar(partes[1], partes[0]);
        adicionar(partes[0], partes[1]);
    }

    if (canalLimpo) {
        adicionar(musicaProvavel || tituloLimpo, canalLimpo);
    }

    return { tituloLimpo, tentativas };
}

function calcularScoreCompatibilidadeLetra(track, tentativas) {
    const tituloTrack = normalizarComparacao(track?.trackName || track?.name || "");
    const artistaTrack = normalizarComparacao(track?.artistName || track?.artist || "");
    const duracaoEsperada = obterDuracaoEsperadaLetra();
    const duracaoTrack = obterDuracaoCandidataLetra(track);
    let melhorScore = 0;

    tentativas.forEach((tentativa) => {
        const musicaTentativa = normalizarComparacao(tentativa.song || "");
        const artistaTentativa = normalizarComparacao(tentativa.artist || "");
        let score = 0;

        if (musicaTentativa && tituloTrack) {
            if (tituloTrack === musicaTentativa) score += 80;
            else if (tituloTrack.includes(musicaTentativa) || musicaTentativa.includes(tituloTrack)) score += 45;

            const tokensMusica = musicaTentativa.split(" ").filter((token) => token.length > 2);
            score += tokensMusica.filter((token) => tituloTrack.includes(token)).length * 8;
        }

        if (artistaTentativa && artistaTrack) {
            if (artistaTrack === artistaTentativa) score += 60;
            else if (artistaTrack.includes(artistaTentativa) || artistaTentativa.includes(artistaTrack)) score += 30;

            const tokensArtista = artistaTentativa.split(" ").filter((token) => token.length > 2);
            score += tokensArtista.filter((token) => artistaTrack.includes(token)).length * 6;
        }

        if (duracaoEsperada > 0 && duracaoTrack > 0) {
            const diferenca = Math.abs(duracaoTrack - duracaoEsperada);
            if (diferenca <= 4) score += 40;
            else if (diferenca <= 8) score += 25;
            else if (diferenca <= 15) score += 10;
            else if (diferenca >= 25) score -= 35;
        }

        if (score > melhorScore) {
            melhorScore = score;
        }
    });

    return melhorScore;
}

function analisarCompatibilidadeLetra(track, tentativas) {
    const tituloTrack = limparSegmentoMusical(track?.trackName || track?.name || "");
    const artistaTrack = limparSegmentoMusical(track?.artistName || track?.artist || "");
    const duracaoEsperada = obterDuracaoEsperadaLetra();
    const duracaoTrack = obterDuracaoCandidataLetra(track);
    const contextoTrack = normalizarComparacao([
        track?.trackName || track?.name || "",
        track?.artistName || track?.artist || "",
        track?.albumName || track?.album || ""
    ].join(" "));
    const tituloNorm = normalizarComparacao(tituloTrack);
    const artistaNorm = normalizarComparacao(artistaTrack);
    let melhor = {
        total: 0,
        tituloScore: 0,
        artistaScore: 0,
        duracaoScore: 0,
        tentativa: null
    };

    tentativas.forEach((tentativa) => {
        const musica = limparSegmentoMusical(tentativa.song || "");
        const artista = limparSegmentoMusical(tentativa.artist || "");
        const musicaNorm = normalizarComparacao(musica);
        const artistaTentativaNorm = normalizarComparacao(artista);
        let tituloScore = 0;
        let artistaScore = 0;
        let duracaoScore = 0;

        if (musicaNorm && tituloNorm) {
            if (tituloNorm === musicaNorm) tituloScore = 100;
            else if (tituloNorm.includes(musicaNorm) || musicaNorm.includes(tituloNorm)) tituloScore = 70;
            else {
                const tokensMusica = musicaNorm.split(" ").filter((token) => token.length > 2);
                tituloScore = tokensMusica.filter((token) => tituloNorm.includes(token)).length * 12;
            }
        }

        if (artistaTentativaNorm && artistaNorm) {
            if (artistaNorm === artistaTentativaNorm) artistaScore = 100;
            else if (artistaNorm.includes(artistaTentativaNorm) || artistaTentativaNorm.includes(artistaNorm)) artistaScore = 65;
            else {
                const tokensArtista = artistaTentativaNorm.split(" ").filter((token) => token.length > 2);
                artistaScore = tokensArtista.filter((token) => artistaNorm.includes(token)).length * 14;
            }
        }

        if (artistaScore < 65 && artistaTentativaNorm && contextoTrack) {
            const tokensContexto = artistaTentativaNorm.split(" ").filter((token) => token.length > 2);
            const tokensEncontrados = tokensContexto.filter((token) => contextoTrack.includes(token)).length;

            if (tokensEncontrados === tokensContexto.length && tokensContexto.length > 0) {
                artistaScore = Math.max(artistaScore, 65);
            } else if (tokensEncontrados > 0) {
                artistaScore = Math.max(artistaScore, tokensEncontrados * 18);
            }
        }

        if (duracaoEsperada > 0 && duracaoTrack > 0) {
            const diferenca = Math.abs(duracaoTrack - duracaoEsperada);
            if (diferenca <= 4) duracaoScore = 100;
            else if (diferenca <= 8) duracaoScore = 80;
            else if (diferenca <= 15) duracaoScore = 50;
            else if (diferenca <= 20) duracaoScore = 25;
            else duracaoScore = 0;
        }

        const total = tituloScore + artistaScore + Math.round(duracaoScore * 0.35);
        if (total > melhor.total) {
            melhor = {
                total,
                tituloScore,
                artistaScore,
                duracaoScore,
                tentativa
            };
        }
    });

    const precisaValidarArtista = tentativas.some((tentativa) => (tentativa.artist || "").trim().length > 0);
    const tituloAceito = melhor.tituloScore >= 70 && tituloCompativelComBusca(track?.trackName || track?.name || "", tentativas);
    const artistaAceito = !precisaValidarArtista
        || melhor.artistaScore >= 65
        || artistaCompativelComBusca(track?.artistName || track?.artist || "", tentativas);
    const duracaoAceita = !duracaoEsperada || !duracaoTrack || melhor.duracaoScore >= 25;
    const aceito = tituloAceito && artistaAceito && duracaoAceita;

    return {
        ...melhor,
        aceito
    };
}

async function fetchComTimeout(url, timeoutMs = 5000, options = {}) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
    } catch (e) {
        return null;
    }
}

async function fetchLrclib(url) {
    const res = await fetchComTimeout(url, 5000);
    if (!res || !res.ok) return null;
    try {
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function buscarNaLrclib(tentativas) {
    const tentativasAtivas = tentativas.slice(0, 6);
    let melhorResultadoSemSync = null;
    let melhorResultadoRelaxado = null;
    const tituloPrincipal = tentativasAtivas[0]?.song || "";
    const tituloGenerico = tituloEhGenerico(tituloPrincipal);

    for (const tentativa of tentativasAtivas) {
        let urls = [];
        if (tentativa.artist) {
            urls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(tentativa.song)}&artist_name=${encodeURIComponent(tentativa.artist)}`);
        }
        urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(tentativa.query)}`);

        for (const url of urls) {
            try {
                const data = await fetchLrclib(url);
                
                if (data && Array.isArray(data) && data.length > 0) {
                    const candidatosPontuados = data
                        .map((track) => ({
                            track,
                            score: calcularScoreCompatibilidadeLetra(track, tentativasAtivas),
                            compatibilidade: analisarCompatibilidadeLetra(track, tentativasAtivas)
                        }))
                        .sort((a, b) => {
                            if (!!b.track.syncedLyrics !== !!a.track.syncedLyrics) {
                                return Number(!!b.track.syncedLyrics) - Number(!!a.track.syncedLyrics);
                            }
                            if (b.compatibilidade.tituloScore !== a.compatibilidade.tituloScore) {
                                return b.compatibilidade.tituloScore - a.compatibilidade.tituloScore;
                            }
                            if (b.compatibilidade.total !== a.compatibilidade.total) {
                                return b.compatibilidade.total - a.compatibilidade.total;
                            }
                            return b.score - a.score;
                        });

                    const candidatosValidos = candidatosPontuados
                        .filter((item) => item.compatibilidade.aceito);

                    const comSync = candidatosValidos.find((item) => item.track.syncedLyrics);
                    if (comSync) {
                        return comSync.track;
                    } else if (!melhorResultadoSemSync && candidatosValidos[0]) {
                        melhorResultadoSemSync = candidatosValidos[0].track;
                    }

                    if (
                        !melhorResultadoRelaxado
                        && candidatosPontuados[0]?.compatibilidade?.tituloScore >= 92
                        && !tituloGenerico
                        && (
                            candidatosPontuados[0]?.compatibilidade?.artistaScore >= 50
                            || candidatosPontuados[0]?.compatibilidade?.duracaoScore >= 50
                        )
                    ) {
                        melhorResultadoRelaxado = candidatosPontuados[0].track;
                    }
                }
            } catch (e) {
                console.error("Erro interno no processamento do LRCLIB:", e);
            }
        }
    }

    return melhorResultadoSemSync || melhorResultadoRelaxado;
}

async function fetchLyricsOvh(url) {
    const res = await fetchComTimeout(url, 5000);
    if (!res || !res.ok) return null;
    try {
        const data = await res.json();
        return data && data.lyrics ? data.lyrics : null;
    } catch (e) {
        return null;
    }
}

async function buscarNaLyricsOvh(tentativas) {
    const tentativasAtivas = tentativas.filter(t => t.artist && t.song).slice(0, 6);

    for (const tentativa of tentativasAtivas) {
        try {
            const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(tentativa.artist)}/${encodeURIComponent(tentativa.song)}`;
            const lyrics = await fetchLyricsOvh(url);
            if (lyrics) {
                return lyrics;
            }
        } catch (e) {
            console.error("Erro interno no processamento do LyricsOvh:", e);
        }
    }

    return null;
}

function extrairLinhasLimpas(lyrics) {
    return String(lyrics || "")
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter(Boolean);
}

function obterDuracaoAtualMusica() {
    try {
        if (ytPlayer && typeof ytPlayer.getDuration === "function") {
            const duracao = Number(ytPlayer.getDuration());
            if (Number.isFinite(duracao) && duracao > 0) return duracao;
        }
    } catch (erro) {
        return 0;
    }

    return 0;
}

function obterDuracaoEsperadaLetra() {
    const duracaoPlayer = obterDuracaoAtualMusica();
    if (duracaoPlayer > 0) return duracaoPlayer;

    const duracaoSalva = Number(localStorage.getItem("musicaDuracao") || 0);
    return Number.isFinite(duracaoSalva) && duracaoSalva > 0 ? duracaoSalva : 0;
}

function obterDuracaoCandidataLetra(track) {
    const candidatos = [
        Number(track?.duration || 0),
        Number(track?.durationSec || 0),
        Number(track?.length || 0),
        Number(track?.lengthSec || 0)
    ].filter((valor) => Number.isFinite(valor) && valor > 0);

    const primeiro = candidatos[0] || 0;
    if (primeiro > 1000) {
        return primeiro / 1000;
    }

    return primeiro;
}

function obterTituloTrackLetra(track, fallback = "") {
    return limparSegmentoMusical(track?.trackName || track?.name || fallback || "");
}

function obterArtistaTrackLetra(track, fallback = "") {
    return limparSegmentoMusical(track?.artistName || track?.artist || fallback || "");
}

function renderizarLetraPrioritaria(divLetra, letra, status) {
    if (letra?.syncedLyrics) {
        limparEstadoLetraAproximada();
        document.getElementById("painelSync").style.display = "flex";
        atualizarStatusSincronia(status || "Letra validada encontrada. Aperte play para cantar no tempo.");
        carregarLinhasSincronizadasDoLrc(letra.syncedLyrics);

        if (linhasSincronizadas.length > 0) {
            renderizarPainelLetraSync(-1, 0, 0);
            if (cantando) {
                clearInterval(syncInterval);
                iniciarSyncLetra();
            }
            return true;
        }
    }

    if (letra?.plainLyrics) {
        renderizarLetraSemSync(
            divLetra,
            letra.plainLyrics,
            "Letra validada carregada do banco.",
            status || "Letra validada carregada do banco. Use a sincronizacao aproximada como guia."
        );
        return true;
    }

    return false;
}

function limparEstadoLetraAproximada() {
    letraAproximadaAtiva = false;
    letraAtualSemSync = "";
    duracaoBaseSyncAproximada = 0;
}

function carregarLinhasSincronizadasDoLrc(lrc) {
    linhasSincronizadas = [];
    const lines = String(lrc || "").split("\n");

    lines.forEach((linha) => {
        const match = linha.match(/\[(\d{1,2}):(\d{2}(?:\.\d{2})?)\](.*)/);
        if (!match) return;

        const m = parseInt(match[1], 10);
        const s = parseFloat(match[2]);
        const tempo = (m * 60) + s;
        let texto = match[3].trim() || "...";

        texto = texto.replace(/<\d{2}:\d{2}(?:\.\d{2,3})?>/g, "");
        linhasSincronizadas.push({ tempo, texto });
    });

    let indiceLinhaSync = 0;
    lines.forEach((linha) => {
        const match = linha.match(/\[(\d{1,2}):(\d{2}(?:\.\d{2})?)\](.*)/);
        if (!match) return;

        const linhaSync = linhasSincronizadas[indiceLinhaSync];
        indiceLinhaSync++;
        if (!linhaSync) return;

        const conteudoBruto = match[3] || "";
        const palavras = [];
        const regexPalavra = /<(\d{2}):(\d{2}(?:\.\d{2,3})?)>([^<]*)/g;
        let trecho = null;

        while ((trecho = regexPalavra.exec(conteudoBruto)) !== null) {
            const tempoPalavra = (parseInt(trecho[1], 10) * 60) + parseFloat(trecho[2]);
            const textoPalavra = trecho[3] || "";

            if (textoPalavra) {
                palavras.push({ tempo: tempoPalavra, texto: textoPalavra });
            }
        }

        linhaSync.texto = linhaSync.texto.trim() || "...";
        linhaSync.palavras = palavras;
    });

    linhasSincronizadas.forEach((linhaAtual, indice) => {
        const proximaLinha = linhasSincronizadas[indice + 1];
        linhaAtual.tempoFinal = proximaLinha?.tempo || (linhaAtual.tempo + 2.5);
    });
}

function estimarPesoLinhaSemSync(texto = "") {
    const textoLimpo = String(texto || "").trim();
    if (!textoLimpo) return 1;

    const palavras = textoLimpo.split(/\s+/).filter(Boolean);
    const totalCaracteres = textoLimpo.replace(/\s+/g, "").length;
    const pausas = (textoLimpo.match(/[,:;.!?()-]/g) || []).length;

    return Math.max(
        1.4,
        (palavras.length * 1.25) + (totalCaracteres * 0.055) + (pausas * 0.35)
    );
}

function gerarSincronizacaoAproximada(lyrics, duracaoBase = 0) {
    const linhas = extrairLinhasLimpas(lyrics);
    linhasSincronizadas = [];

    if (linhas.length === 0) return false;

    const duracao = duracaoBase || obterDuracaoAtualMusica() || 150;
    const inicio = Math.min(18, Math.max(6, duracao * 0.08));
    const fim = Math.max(inicio + 1, duracao - Math.min(6, Math.max(2.5, duracao * 0.04)));
    const janelaUtil = Math.max(fim - inicio, 1);
    const pesos = linhas.map((texto) => estimarPesoLinhaSemSync(texto));
    const pesoTotal = pesos.reduce((acc, valor) => acc + valor, 0) || linhas.length;
    let cursor = inicio;

    linhas.forEach((texto, indice) => {
        const fatia = (pesos[indice] / pesoTotal) * janelaUtil;
        const tempo = Math.min(cursor, fim);
        const tempoFinal = indice === linhas.length - 1
            ? fim
            : Math.min(cursor + fatia, fim);
        linhasSincronizadas.push({
            tempo,
            texto,
            tempoFinal: Math.max(tempoFinal, tempo + 1.2)
        });
        cursor = tempoFinal;
    });

    return linhasSincronizadas.length > 0;
}

function recalcularSincronizacaoAproximadaSeNecessario(atualizarPainel = false) {
    if (!letraAproximadaAtiva || !letraAtualSemSync) return false;

    const duracaoAtual = obterDuracaoAtualMusica();
    if (!(duracaoAtual > 0) || Math.abs(duracaoAtual - duracaoBaseSyncAproximada) < 1) {
        return false;
    }

    if (!gerarSincronizacaoAproximada(letraAtualSemSync, duracaoAtual)) {
        return false;
    }

    duracaoBaseSyncAproximada = duracaoAtual;

    if (atualizarPainel) {
        const tempoAtual = ytPlayer && typeof ytPlayer.getCurrentTime === "function"
            ? (Number(ytPlayer.getCurrentTime()) || 0) + offsetLetra
            : 0;
        const ativa = linhasSincronizadas.reduce((ultimoIndice, linha, indice) => (
            tempoAtual >= linha.tempo ? indice : ultimoIndice
        ), -1);
        renderizarPainelLetraSync(ativa, 0, tempoAtual);
    } else {
        renderizarPainelLetraSync(-1, 0, 0);
    }

    return true;
}

function renderizarLetraSemSync(divLetra, lyrics, aviso, status) {
    const painelSync = document.getElementById("painelSync");
    const temSyncAproximada = gerarSincronizacaoAproximada(lyrics);

    if (temSyncAproximada) {
        letraAproximadaAtiva = true;
        letraAtualSemSync = lyrics || "";
        duracaoBaseSyncAproximada = obterDuracaoAtualMusica() || 150;
        if (painelSync) painelSync.style.display = "flex";
        atualizarStatusSincronia(status);
        renderizarPainelLetraSync(-1, 0, 0);

        if (cantando) {
            clearInterval(syncInterval);
            iniciarSyncLetra();
        }
        return;
    }

    limparEstadoLetraAproximada();
    divLetra.classList.remove("letra-sync-painel");
    atualizarStatusSincronia(status);
    divLetra.innerHTML = `<p style='color:var(--neon-yellow); font-size:0.9rem; margin-bottom:15px'>${aviso}</p>${String(lyrics || "").replace(/\n/g, "<br><br>")}`;
}

function renderizarLetraNaoEncontrada(divLetra, tituloLimpo) {
    limparEstadoLetraAproximada();
    divLetra.classList.remove("letra-sync-painel");
    atualizarStatusSincronia("Ainda nao encontrei essa letra. Tente outra versao da musica.");
    divLetra.innerHTML = `<p><em>Ainda nao encontrei a letra para '${escaparHtml(tituloLimpo)}'.</em></p><p style="opacity:0.8">Dica: tente outra versao do video ou pesquise usando apenas artista e musica.</p>`;
}

// ============================================================
// BUSCAR LETRA DA MUSICA
// ============================================================
async function buscarLetra(canalYoutube, tituloVideo) {
    const divLetra = document.getElementById("divLetra");
    if (!divLetra) return;

    divLetra.innerHTML = "<p>Carregando letra...</p>";
    divLetra.dataset.activeIndex = "";
    atualizarStatusSincronia("Procurando letra sincronizada...");
    linhasSincronizadas = [];
    offsetLetra = 0;
    limparEstadoLetraAproximada();

    if (!document.getElementById("painelSync")) {
        let painel = document.createElement("div");
        painel.id = "painelSync";
        painel.className = "painel-sync";
        painel.innerHTML = `
            <span>Sincronia:</span>
            <button onclick="mudarOffset(-0.5)" class="painel-sync-btn">-0.5s</button>
            <span id="txtOffset">0s</span>
            <button onclick="mudarOffset(0.5)" class="painel-sync-btn">+0.5s</button>
        `;
        divLetra.parentNode.insertBefore(painel, divLetra);
    } else {
        document.getElementById("painelSync").style.display = "none";
        document.getElementById("txtOffset").innerText = "0s";
    }

    const { tituloLimpo, tentativas } = gerarTentativasBuscaLetra(canalYoutube, tituloVideo);
    const tituloPrincipal = tentativas[0]?.song || tituloLimpo;
    const tituloGenerico = tituloEhGenerico(tituloPrincipal);
    const permitirCache = !tituloGenerico;
    const cacheKeysDiretas = combinarChavesCache(
        criarChavesCacheDiretas(
            localStorage.getItem("musicaAudio") || "",
            localStorage.getItem("musicaBuscaOriginal") || ""
        ),
        criarChavesCacheLetra(tituloLimpo, canalYoutube)
    );
    const cacheKeysBusca = tituloGenerico
        ? cacheKeysDiretas
        : combinarChavesCache(cacheKeysDiretas, criarChavesCacheLetra("", "", tentativas));
    const cacheKeysPersistencia = cacheKeysDiretas;

    if (cacheKeysPersistencia.length === 0) {
        cacheKeysPersistencia.push(...cacheKeysBusca);
    }

    try {
        try {
            const letraVerificada = await buscarLetraVerificadaSupabase([
                { song: tituloLimpo, artist: canalYoutube },
                ...tentativas
            ]);

            if (renderizarLetraPrioritaria(
                divLetra,
                letraVerificada,
                "Letra validada encontrada no banco. Aperte play para cantar."
            )) {
                return;
            }
        } catch (erro) {
            logErroPadrao("Supabase verified lyrics select", erro);
        }

        let cacheHit = null;
        if (permitirCache) {
            cacheHit = buscarLetraNoCache(cacheKeysBusca);
            if (!cacheLetraEhCompativel(cacheHit, tituloLimpo, tentativas)) {
                cacheHit = null;
            }
        }

        if (!cacheHit && permitirCache) {
            try {
                const supabaseHit = await buscarLetraSupabase(
                    [{ song: tituloLimpo, artist: canalYoutube }, ...tentativas],
                    cacheKeysBusca
                );
                if (cacheLetraEhCompativel(supabaseHit, tituloLimpo, tentativas)) {
                    cacheHit = supabaseHit;
                    salvarLetraNoCache(cacheKeysPersistencia, supabaseHit);
                }
            } catch (erro) {
                logErroPadrao("Supabase lyrics select", erro);
            }
        }

        if (cacheHit?.syncedLyrics) {
            limparEstadoLetraAproximada();
            document.getElementById("painelSync").style.display = "flex";
            atualizarStatusSincronia("Letra carregada do cache local. Aperte play para cantar no tempo.");
            carregarLinhasSincronizadasDoLrc(cacheHit.syncedLyrics);

            if (linhasSincronizadas.length > 0) {
                renderizarPainelLetraSync(-1, 0, 0);
                if (cantando) {
                    clearInterval(syncInterval);
                    iniciarSyncLetra();
                }
                return;
            }
        }

        if (cacheHit?.plainLyrics) {
            renderizarLetraSemSync(
                divLetra,
                cacheHit.plainLyrics,
                "Aviso: letra carregada do cache local, com sincronizacao aproximada.",
                "Letra carregada do cache local. A sincronizacao fica aproximada."
            );
            return;
        }

        const track = await buscarNaLrclib(tentativas);

        if (track && track.syncedLyrics) {
            limparEstadoLetraAproximada();
            document.getElementById("painelSync").style.display = "flex";
            atualizarStatusSincronia("Letra sincronizada encontrada. Aperte play para cantar no tempo.");
            carregarLinhasSincronizadasDoLrc(track.syncedLyrics);
            const payload = {
                source: "lrclib",
                plainLyrics: track.plainLyrics || "",
                syncedLyrics: track.syncedLyrics || "",
                duracao: obterDuracaoCandidataLetra(track) || obterDuracaoEsperadaLetra() || 0,
                titulo: obterTituloTrackLetra(track, tituloLimpo) || tituloLimpo,
                artista: obterArtistaTrackLetra(track, canalYoutube) || canalYoutube
            };
            if (permitirCache) {
                salvarLetraNoCache(cacheKeysPersistencia, payload);
                salvarLetraSupabase(cacheKeysPersistencia, payload);
            }

            if (linhasSincronizadas.length > 0) {
                renderizarPainelLetraSync(-1, 0, 0);
            } else {
                divLetra.classList.remove("letra-sync-painel");
                divLetra.innerHTML = "<p>Letra sincronizada carregada.</p>";
            }

            if (cantando) {
                clearInterval(syncInterval);
                iniciarSyncLetra();
            }
            return;
        }

        if (track && track.plainLyrics) {
            const payload = {
                source: "lrclib-plain",
                plainLyrics: track.plainLyrics || "",
                syncedLyrics: "",
                duracao: obterDuracaoCandidataLetra(track) || obterDuracaoEsperadaLetra() || 0,
                titulo: obterTituloTrackLetra(track, tituloLimpo) || tituloLimpo,
                artista: obterArtistaTrackLetra(track, canalYoutube) || canalYoutube
            };
            if (permitirCache) {
                salvarLetraNoCache(cacheKeysPersistencia, payload);
                salvarLetraSupabase(cacheKeysPersistencia, payload);
            }
            renderizarLetraSemSync(
                divLetra,
                track.plainLyrics,
                "Aviso: letra encontrada sem sincronizacao automatica.",
                "Letra encontrada sem marcacao de tempo. Use a sincronizacao aproximada como guia."
            );
            return;
        }

        console.log("LRCLib falhou. Tentando API alternativa...");
        const ovhLyrics = await buscarNaLyricsOvh(tentativas);

        if (ovhLyrics) {
            const payload = {
                source: "lyricsovh",
                plainLyrics: ovhLyrics || "",
                syncedLyrics: "",
                duracao: obterDuracaoEsperadaLetra() || 0,
                titulo: tituloLimpo,
                artista: canalYoutube
            };
            if (permitirCache) {
                salvarLetraNoCache(cacheKeysPersistencia, payload);
                salvarLetraSupabase(cacheKeysPersistencia, payload);
            }
            renderizarLetraSemSync(
                divLetra,
                ovhLyrics,
                "Aviso: letra resgatada do servidor auxiliar, sem sincronizacao exata.",
                "Letra carregada do servidor auxiliar. A sincronizacao fica aproximada."
            );
            return;
        }

        renderizarLetraNaoEncontrada(divLetra, tituloLimpo);
    } catch (e) {
        console.error(e);
        divLetra.classList.remove("letra-sync-painel");
        atualizarStatusSincronia("Erro ao carregar a letra. Tente outra versao da musica.");
        divLetra.innerHTML = "<p><em>Erro de conexao ao buscar a letra.</em></p>";
    }
}

function mudarOffset(valor) {
    offsetLetra += valor;
    let sinal = offsetLetra > 0 ? "+" : "";
    document.getElementById("txtOffset").innerText = offsetLetra === 0 ? "0s" : sinal + offsetLetra.toFixed(1) + "s";
}


function voltarMenu() {
    window.location.href = "menu.html";
}
