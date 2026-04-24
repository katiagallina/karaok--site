// Substitua o texto abaixo pela sua nova Chave de API gerada no Google Cloud Console
const YOUTUBE_API_KEY = "AIzaSyBhpdlWVIHHVDOg9rRBWMc5uyAAcEoqazA";
const SUPABASE_URL = "https://ybantvgcrelqwyvjkvsj.supabase.co";
const SUPABASE_KEY = "sb_publishable_YOnl_Qc5PQ5o9229nVx8Yg_ArNvGUHS";
const SUPABASE_TABLE = "ranking";
const SUPABASE_REST_PATH = "/rest/v1";
const RANKING_STORAGE_KEY = "rankingLocal";
const RESULTADO_ATUAL_ID_KEY = "resultadoAtualId";
const RESULTADO_PROCESSADO_KEY = "ultimoResultadoProcessado";
const RESULTADO_REMOTO_KEY = "ultimoResultadoRemoto";

let ytPlayer = null;
let playerPronto = false;
let syncInterval = null;
let progressInterval = null;
let pontuacaoInterval = null;
let linhasSincronizadas = [];
let cantando = false;
let ultimaLinhaAtiva = -1;
let ultimoScrollLetraTs = 0;
let microfoneStream = null;
let microfoneContexto = null;
let microfoneAnalyser = null;
let microfoneDados = null;
let microfonePronto = false;

const PONTUACAO_INTERVALO_MS = 700;
const LIMIAR_VOZ = 12;

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

function atualizarStatusMicrofone(texto) {
    const status = document.getElementById("statusMicrofone");
    if (status) {
        status.innerText = texto;
    }
}

async function inicializarMicrofone() {
    if (microfonePronto && microfoneAnalyser) {
        if (microfoneContexto && microfoneContexto.state === "suspended") {
            await microfoneContexto.resume();
        }
        return true;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        atualizarStatusMicrofone("Seu navegador nao suporta captura de microfone.");
        throw new Error("Microfone indisponivel neste navegador.");
    }

    try {
        microfoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            atualizarStatusMicrofone("AudioContext nao suportado para leitura do microfone.");
            throw new Error("AudioContext indisponivel.");
        }

        microfoneContexto = microfoneContexto || new AudioContextClass();
        const origem = microfoneContexto.createMediaStreamSource(microfoneStream);
        microfoneAnalyser = microfoneContexto.createAnalyser();
        microfoneAnalyser.fftSize = 2048;
        microfoneDados = new Uint8Array(microfoneAnalyser.fftSize);
        origem.connect(microfoneAnalyser);
        if (microfoneContexto.state === "suspended") {
            await microfoneContexto.resume();
        }
        microfonePronto = true;
        atualizarStatusMicrofone("Microfone conectado. A pontuacao sobe quando sua voz for detectada.");

        return true;
    } catch (erro) {
        atualizarStatusMicrofone("Nao foi possivel acessar o microfone. Sem ele, a nota nao sobe.");
        throw erro;
    }
}

function obterNivelMicrofone() {
    if (!microfoneAnalyser || !microfoneDados) {
        return 0;
    }

    microfoneAnalyser.getByteTimeDomainData(microfoneDados);

    let soma = 0;
    for (let i = 0; i < microfoneDados.length; i++) {
        const amostraNormalizada = (microfoneDados[i] - 128) / 128;
        soma += amostraNormalizada * amostraNormalizada;
    }

    return Math.sqrt(soma / microfoneDados.length) * 100;
}

function encerrarMicrofone() {
    if (microfoneStream) {
        microfoneStream.getTracks().forEach((track) => track.stop());
    }

    if (microfoneContexto && microfoneContexto.state !== "closed") {
        microfoneContexto.close().catch(() => { });
    }

    microfoneStream = null;
    microfoneContexto = null;
    microfoneAnalyser = null;
    microfoneDados = null;
    microfonePronto = false;
}

window.addEventListener("beforeunload", () => {
    encerrarMicrofone();
});

function salvarRankingLocal(registro) {
    const rankingAtual = getRankingLocal();
    rankingAtual.push(registro);
    rankingAtual.sort((a, b) => (b.pontuacao || 0) - (a.pontuacao || 0));
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankingAtual.slice(0, 20)));
}

function obterInicioDoDiaISO() {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0);
    return inicio.toISOString();
}

async function inserirPontuacaoSupabase(registro) {
    if (!validarConfiguracaoSupabase()) {
        throw new Error("[Supabase:config] Configuracao invalida para inserir ranking.");
    }

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

async function buscarRankingSupabase() {
    if (!validarConfiguracaoSupabase()) {
        throw new Error("[Supabase:config] Configuracao invalida para consultar ranking.");
    }

    const inicioDoDia = obterInicioDoDiaISO();
    const query = `select=nome,pontuacao,musica,modo,created_at&modo=eq.livre&created_at=gte.${encodeURIComponent(inicioDoDia)}&order=pontuacao.desc,created_at.asc&limit=10`;
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
        const selo = index === 0 && origem === "supabase" ? " 🌟" : "";
        return `<li><strong>${index + 1}. ${nome}</strong> - ${item.pontuacao || 0} pts${selo}${musica}</li>`;
    }).join("");
}

function inicializarPaginaResultado() {
    const nomeFinal = document.getElementById("nomeFinal");
    const pontuacaoFinal = document.getElementById("pontuacaoFinal");
    const avaliacao = document.getElementById("avaliacao");
    const nome = localStorage.getItem("nome") || "Cantor(a)";
    const musica = localStorage.getItem("musicaNome") || "";
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

    if ((localStorage.getItem("modoAtual") || "livre") === "livre") {
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

async function inicializarPaginaRanking() {
    const local = getRankingLocal()
        .filter((item) => item.modo === "livre")
        .sort((a, b) => (b.pontuacao || 0) - (a.pontuacao || 0))
        .slice(0, 10);

    renderizarRanking(local, "local");

    try {
        const remoto = await buscarRankingSupabase();
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
});

// ============================================================
// INICIALIZACAO KARAOKE
// ============================================================
if (pagina.includes("karaoke.html")) {
    window.addEventListener("DOMContentLoaded", () => {
        let nome = localStorage.getItem("nome");
        let musicaNome = localStorage.getItem("musicaNome");
        let musicaArtista = localStorage.getItem("musicaArtista");

        document.getElementById("nomeMusica").innerText = musicaNome || "Nenhuma musica";
        document.getElementById("nomeUsuario").innerText = nome ? "Cantor: " + nome : "";

        if (musicaNome) buscarLetra(musicaArtista || "", musicaNome);
        if (yt) carregarAPIYouTube();
    });
} else if (pagina.endsWith("resultado.html")) {
    window.addEventListener("DOMContentLoaded", () => {
        let modo = localStorage.getItem("modoAtual");
        let btnCantar = document.querySelector('a[href="modo-livre.html"]');

        if (btnCantar && modo === "desafio") {
            btnCantar.href = "desafio.html";
            btnCantar.innerHTML = "🔄 Novo duelo";
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
                let loading = document.getElementById("loadingMusica");
                if (loading) {
                    loading.innerText = "Tudo pronto! Clique em Comecar a Cantar.";
                }
            },
            onError: (e) => {
                console.error("Erro no player do YouTube:", e.data);

                if (e.data == 150 || e.data == 101) {
                    let alternativos = JSON.parse(localStorage.getItem("musicasAlternativas") || "[]");
                    let ytAtual = e.target.getVideoData().video_id || yt;
                    let idx = alternativos.indexOf(ytAtual);

                    if (idx !== -1 && idx < alternativos.length - 1) {
                        let proximoVideo = alternativos[idx + 1];
                        console.log("Tentando video alternativo...", proximoVideo);

                        document.getElementById("loadingMusica").innerText = "Video bloqueado pelo autor. Carregando versao secundaria...";
                        e.target.loadVideoById(proximoVideo);
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
async function cantar() {
    if (!playerPronto) {
        alert("Aguarde o carregamento...");
        return;
    }

    try {
        await inicializarMicrofone();
    } catch (erro) {
        console.error("Erro ao iniciar microfone:", erro);
        alert("Precisamos do microfone para calcular a pontuacao. Libere a permissao e tente novamente.");
        return;
    }

    ytPlayer.playVideo();
    cantando = true;

    document.getElementById("btnPlay").style.display = "none";
    document.getElementById("btnPausar").style.display = "inline-block";
    document.getElementById("loadingMusica").innerText = "Solta a voz!";
    atualizarStatusSincronia("A musica comecou. A linha destacada mostra a hora certa de entrar.");

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
        atualizarStatusMicrofone("Microfone em pausa. A pontuacao para enquanto a musica estiver pausada.");
        if (btn) btn.innerHTML = "&#9654; Retomar";
    } else {
        ytPlayer.playVideo();
        cantando = true;
        atualizarStatusSincronia("Musica retomada. Acompanhe a linha destacada.");
        atualizarStatusMicrofone("Microfone ativo. Cante para continuar pontuando.");
        if (btn) btn.innerHTML = "&#9646;&#9646; Pausar";
    }
}

function finalizar() {
    if (ytPlayer && typeof ytPlayer.stopVideo === "function") {
        ytPlayer.stopVideo();
    }

    localStorage.setItem("pontuacaoFinal", String(obterPontuacaoAtual()));
    localStorage.setItem(RESULTADO_ATUAL_ID_KEY, gerarResultadoAtualId());
    clearInterval(syncInterval);
    clearInterval(progressInterval);
    clearInterval(pontuacaoInterval);
    encerrarMicrofone();
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

        const nivelMicrofone = obterNivelMicrofone();
        if (nivelMicrofone < LIMIAR_VOZ) {
            atualizarStatusMicrofone("Sem voz detectada. Cante mais perto do microfone para pontuar.");
            return;
        }

        const atual = parseInt((placar.innerText || "").replace(/\D/g, ""), 10) || 0;
        placar.innerHTML = "&#11088; " + (atual + 1);
        atualizarStatusMicrofone(`Voz detectada. Nivel ${Math.round(nivelMicrofone)}. Pontos subindo.`);
    }, PONTUACAO_INTERVALO_MS);
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

function renderizarPainelLetraSync(indiceAtual, progresso = 0) {
    const divLetra = document.getElementById("divLetra");
    if (!divLetra) return;

    divLetra.classList.add("letra-sync-painel");

    const anterior = indiceAtual > 0 ? linhasSincronizadas[indiceAtual - 1]?.texto || "" : "";
    const atual = indiceAtual >= 0 ? linhasSincronizadas[indiceAtual]?.texto || "" : "";
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
            divLetra.innerHTML = `
                <div class="sync-stack">
                    <div class="sync-linha sync-linha-anterior">${escaparHtml(anterior)}</div>
                    <div class="sync-linha sync-linha-atual"><span class="texto-fill">${escaparHtml(atual)}</span></div>
                    <div class="sync-linha sync-linha-proxima">${escaparHtml(proxima)}</div>
                </div>
            `;
        }

        divLetra.dataset.activeIndex = chaveAtual;
    }

    const linhaAtual = divLetra.querySelector(".sync-linha-atual");
    if (linhaAtual) {
        linhaAtual.style.setProperty("--active-progress", `${progresso}%`);
    }
}

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
                renderizarPainelLetraSync(-1, 0);
                const primeiraLinha = linhasSincronizadas[0];
                atualizarStatusSincronia("Letra sincronizada pronta.");
                return;
            }

            const linhaAtual = linhasSincronizadas[ativa];
            const proximaLinha = linhasSincronizadas[ativa + 1] || null;
            const duracaoLinha = proximaLinha ? Math.max(proximaLinha.tempo - linhaAtual.tempo, 0.35) : 2.5;
            const progresso = Math.max(0, Math.min(((tempo - linhaAtual.tempo) / duracaoLinha) * 100, 100));
            renderizarPainelLetraSync(ativa, progresso);

            ultimaLinhaAtiva = ativa;

            atualizarStatusSincronia("Acompanhe a letra destacada abaixo.");
        } else if (divLetra.scrollTop < divLetra.scrollHeight - divLetra.offsetHeight) {
            atualizarStatusSincronia("Letra sem tempo exato. A rolagem esta automatica.");
            divLetra.scrollTop += 0.5;
        }
    }, 60);
}

// ============================================================
// BUSCAR MUSICA
// ============================================================
async function buscarMusica() {
    let termo = document.getElementById("buscaMusica").value.trim();
    let div = document.getElementById("resultadosBusca");

    if (!termo) {
        alert("Digite uma musica!");
        return;
    }

    div.innerHTML = "Buscando...";

    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(termo + " karaoke instrumental")}&type=video&videoEmbeddable=true&videoSyndicated=true&key=${YOUTUBE_API_KEY}&maxResults=5`;

    try {
        let res = await fetch(url);
        let data = await res.json();

        if (data.error || !data.items || data.items.length === 0) {
            mostrarResultadosFallback(div, termo);
        } else {
            renderizarListaMusicas(data.items, div);
        }
    } catch (erro) {
        console.error("Erro na busca:", erro);
        mostrarResultadosFallback(div, termo);
    }
}

function renderizarListaMusicas(items, div) {
    div.innerHTML = "";

    let alternativos = items.filter((m) => m.id && m.id.videoId).map((m) => m.id.videoId);
    localStorage.setItem("musicasAlternativas", JSON.stringify(alternativos));

    items.forEach((m) => {
        if (!m.id.videoId) return;

        let item = document.createElement("div");
        item.dataset.title = m.snippet.title;
        item.innerHTML = `<strong>${m.snippet.title}</strong>`;
        item.className = "resultado-item";

        item.onclick = () => {
            document.querySelectorAll(".resultado-item").forEach((el) => {
                el.classList.remove("selecionado");
                el.innerHTML = `<strong>${el.dataset.title}</strong>`;
            });

            item.classList.add("selecionado");
            item.innerHTML = `<strong>${m.snippet.title}</strong> <span class="resultado-ok">OK</span>`;
            selecionarMusica(m.snippet.title, m.snippet.channelTitle || "Karaoke", m.id.videoId);
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
function selecionarMusica(nome, artista, videoId) {
    localStorage.setItem("musicaSelecionada", nome);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
    localStorage.setItem("musicaAudio", videoId);
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
        alert("Por favor, pesquise e selecione uma música primeiro!");
        return;
    }
    window.location.href = "vs.html";
}

function iniciarDuelo() {
    localStorage.setItem("modoAtual", "desafio");
    window.location.href = "karaoke.html";
}

// Variavel para atraso manual da letra
let offsetLetra = 0;

function normalizarTextoBusca(texto) {
    return (texto || "")
        .replace(/\(.*?\)|\[.*?\]/g, " ")
        .replace(/karaok[eê]|instrumental|version|vers[aã]o|cover|playback|com letra|lyrics?|audio oficial|video oficial|official video|official audio/gi, " ")
        .replace(/\|/g, " ")
        .replace(/\s+e\s+/gi, " & ")
        .replace(/[^a-zA-Z0-9À-ÿ\s\-&']/g, " ")
        .replace(/\s+/g, " ")
        .replace(/-\s*-/g, "-")
        .trim();
}

function gerarTentativasBuscaLetra(canalYoutube, tituloVideo) {
    const tituloLimpo = normalizarTextoBusca(tituloVideo);
    const canalLimpo = normalizarTextoBusca(canalYoutube);
    const tentativas = [];
    const vistos = new Set();

    function adicionar(song, artist) {
        const musica = (song || "").trim();
        const artista = (artist || "").trim();
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

    adicionar(tituloLimpo, canalLimpo);

    if (partes.length >= 2) {
        const primeira = partes[0];
        const resto = partes.slice(1).join(" - ");
        adicionar(primeira, resto);
        adicionar(resto, primeira);
        adicionar(primeira, "");
        adicionar(resto, "");
    }

    if (partes.length >= 3) {
        adicionar(partes[0], partes[1]);
        adicionar(partes[1], partes[0]);
    }

    if (canalLimpo) {
        adicionar(tituloLimpo, canalLimpo);
    }

    return { tituloLimpo, tentativas };
}

async function buscarNaLrclib(tentativas) {
    for (const tentativa of tentativas) {
        const consultas = [];

        if (tentativa.artist) {
            consultas.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(tentativa.song)}&artist_name=${encodeURIComponent(tentativa.artist)}`);
        }

        consultas.push(`https://lrclib.net/api/search?q=${encodeURIComponent(tentativa.query)}`);

        for (const url of consultas) {
            const res = await fetch(url);
            if (!res.ok) continue;

            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) continue;

            const comSync = data.find((t) => t.syncedLyrics);
            if (comSync) return comSync;

            if (data[0]) return data[0];
        }
    }

    return null;
}

async function buscarNaLyricsOvh(tentativas) {
    for (const tentativa of tentativas) {
        if (!tentativa.artist || !tentativa.song) continue;

        const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(tentativa.artist)}/${encodeURIComponent(tentativa.song)}`);
        if (!res.ok) continue;

        const data = await res.json();
        if (data && data.lyrics) {
            return data.lyrics;
        }
    }

    return null;
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

    if (!document.getElementById("painelSync")) {
        let painel = document.createElement("div");
        painel.id = "painelSync";
        painel.className = "painel-sync";
        painel.innerHTML = `
            <span>Sincronia:</span>
            <button onclick="mudarOffset(-1)" class="painel-sync-btn">-1s</button>
            <span id="txtOffset">0s</span>
            <button onclick="mudarOffset(1)" class="painel-sync-btn">+1s</button>
        `;
        divLetra.parentNode.insertBefore(painel, divLetra);
    } else {
        document.getElementById("painelSync").style.display = "none";
        document.getElementById("txtOffset").innerText = "0s";
    }

    const { tituloLimpo, tentativas } = gerarTentativasBuscaLetra(canalYoutube, tituloVideo);

    try {
        let track = await buscarNaLrclib(tentativas);

        if (track && track.syncedLyrics) {
            document.getElementById("painelSync").style.display = "flex";
            atualizarStatusSincronia("Letra sincronizada encontrada. Aperte play para cantar no tempo.");

            let lines = track.syncedLyrics.split("\n");

            lines.forEach((linha, i) => {
                let match = linha.match(/\[(\d{1,2}):(\d{2}(?:\.\d{2})?)\](.*)/);
                if (!match) return;

                let m = parseInt(match[1], 10);
                let s = parseFloat(match[2]);
                let tempo = (m * 60) + s;
                let texto = match[3].trim() || "♪";

                // Remove possíveis marcações de tempo por palavra (formato Enhanced LRC)
                texto = texto.replace(/<\d{2}:\d{2}(?:\.\d{2,3})?>/g, "");

                linhasSincronizadas.push({ tempo: tempo, texto: texto });
            });

            if (linhasSincronizadas.length > 0) {
                renderizarPainelLetraSync(-1, 0);
            } else {
                divLetra.classList.remove("letra-sync-painel");
                divLetra.innerHTML = "<p>Letra sincronizada carregada.</p>";
            }

            if (cantando) {
                clearInterval(syncInterval);
                iniciarSyncLetra();
            }
        } else if (track && track.plainLyrics) {
            divLetra.classList.remove("letra-sync-painel");
            atualizarStatusSincronia("Letra encontrada sem marcacao de tempo. Use a rolagem como guia.");
            divLetra.innerHTML = "<p style='color:var(--neon-yellow); font-size:0.9rem; margin-bottom:15px'>Aviso: letra encontrada sem sincronizacao automatica.</p>" + track.plainLyrics.replace(/\n/g, "<br><br>");
        } else {
            console.log("LRCLib falhou. Tentando API alternativa...");
            let ovhLyrics = await buscarNaLyricsOvh(tentativas);

            if (ovhLyrics) {
                divLetra.classList.remove("letra-sync-painel");
                atualizarStatusSincronia("Letra carregada do servidor auxiliar. A sincronizacao fica aproximada.");
                divLetra.innerHTML = "<p style='color:var(--neon-yellow); font-size:0.9rem; margin-bottom:15px'>Aviso: letra resgatada do servidor auxiliar, sem sincronizacao.</p>" + ovhLyrics.replace(/\n/g, "<br><br>");
            } else {
                divLetra.classList.remove("letra-sync-painel");
                atualizarStatusSincronia("Nao encontrei uma letra sincronizada para essa musica.");
                divLetra.innerHTML = "<p><em>Letra nao encontrada na nossa base para '" + tituloLimpo + "'.</em></p>";
            }
        }
    } catch (e) {
        console.error(e);
        divLetra.classList.remove("letra-sync-painel");
        atualizarStatusSincronia("Erro ao carregar a letra. Tente outra versao da musica.");
        divLetra.innerHTML = "<p><em>Erro de conexao ao buscar a letra.</em></p>";
    }
}

function mudarOffset(valor) {
    offsetLetra += valor;
    document.getElementById("txtOffset").innerText = (offsetLetra > 0 ? "+" : "") + offsetLetra + "s";
}


function voltarMenu() {
    window.location.href = "menu.html";
}
