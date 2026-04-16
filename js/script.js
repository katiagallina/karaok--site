// Substitua o texto abaixo pela sua nova Chave de API gerada no Google Cloud Console
const YOUTUBE_API_KEY = "AIzaSyBhpdlWVIHHVDOg9rRBWMc5uyAAcEoqazA";

let ytPlayer = null;
let playerPronto = false;
let syncInterval = null;
let progressInterval = null;
let pontuacaoInterval = null;
let linhasSincronizadas = [];
let cantando = false;
let ultimaLinhaAtiva = -1;
let ultimoScrollLetraTs = 0;

const yt = localStorage.getItem("musicaAudio");
const pagina = window.location.pathname;

// ============================================================
// INICIALIZACAO GERAL (EVENTOS)
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
    let inputBusca = document.getElementById("buscaMusica");
    if (inputBusca) {
        inputBusca.addEventListener("keypress", (e) => {
            if (e.key === "Enter") buscarMusica();
        });
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
function cantar() {
    if (!playerPronto) {
        alert("Aguarde o carregamento...");
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
        if (btn) btn.innerHTML = "&#9654; Retomar";
    } else {
        ytPlayer.playVideo();
        cantando = true;
        atualizarStatusSincronia("Musica retomada. Acompanhe a linha destacada.");
        if (btn) btn.innerHTML = "&#9646;&#9646; Pausar";
    }
}

function finalizar() {
    if (ytPlayer && typeof ytPlayer.stopVideo === "function") {
        ytPlayer.stopVideo();
    }

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
        item.style.cursor = "pointer";
        item.style.padding = "12px";

        item.onclick = () => {
            document.querySelectorAll(".resultado-item").forEach((el) => {
                el.style.borderLeft = "none";
                el.style.background = "";
                el.innerHTML = `<strong>${el.dataset.title}</strong>`;
            });

            item.style.borderLeft = "4px solid var(--neon-green)";
            item.style.background = "rgba(34, 197, 94, 0.2)";
            item.innerHTML = `<strong>${m.snippet.title}</strong> <span style="color:var(--neon-green); float:right; font-size:1.2rem;">OK</span>`;
            selecionarMusica(m.snippet.title, m.snippet.channelTitle || "Karaoke", m.id.videoId);
        };

        div.appendChild(item);
    });
}

function mostrarResultadosFallback(div, termo) {
    div.innerHTML = "<p style='color:#facc15; margin-top:10px; margin-bottom:10px;'>A chave da API falhou. Usando resultados de teste:</p>";

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
        painel.style.cssText = "display:none; justify-content:center; gap:10px; margin-bottom:15px; color:var(--text-muted); font-size:0.9rem;";
        painel.innerHTML = `
            <span>Sincronia:</span>
            <button onclick="mudarOffset(-1)" style="background:transparent; border:1px solid #fff; color:#fff; border-radius:5px; padding:0 5px; cursor:pointer;">-1s</button>
            <span id="txtOffset">0s</span>
            <button onclick="mudarOffset(1)" style="background:transparent; border:1px solid #fff; color:#fff; border-radius:5px; padding:0 5px; cursor:pointer;">+1s</button>
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
