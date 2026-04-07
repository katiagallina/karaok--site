// SUA CHAVE DO YOUTUBE
const YOUTUBE_API_KEY = "AIzaSyBhpdlWVIHHVDOg9rRBWMc5uyAAcEoqazA";

let ytPlayer = null;
let syncInterval = null;
let linhasSincronizadas = [];
let playerPronto = false; // 🔥 NOVO: controla se o player já está pronto

// ================= INICIAR MODO LIVRE =================
function iniciarModoLivre() {
    let nome = document.getElementById("nome").value.trim();
    let musicaSelecionada = localStorage.getItem("musicaSelecionada");

    if (nome === "") {
        alert("Digite seu nome!");
        return;
    }

    if (!musicaSelecionada) {
        alert("Selecione uma música na lista antes de começar!");
        return;
    }

    localStorage.setItem("nome", nome);
    window.location.href = "karaoke.html";
}

// ================= CARREGAMENTO =================
if (window.location.pathname.includes("karaoke.html")) {

    let nome = localStorage.getItem("nome");
    let musicaSelecionada = localStorage.getItem("musicaSelecionada");

    let nomeMusicaElem = document.getElementById("nomeMusica");
    if (nomeMusicaElem) {
        nomeMusicaElem.innerText = musicaSelecionada || "Nenhuma música selecionada";
    }

    let campo = document.getElementById("nomeUsuario");
    if (campo && nome) {
        campo.innerText = "Cantor: " + nome;
    }

    let musicaNome = localStorage.getItem("musicaNome");
    let musicaArtista = localStorage.getItem("musicaArtista");
    let videoId = localStorage.getItem("musicaAudio");

    // 🔥 CORREÇÃO PRINCIPAL: NÃO injeta iframe manualmente.
    // O YT.Player vai criar e gerenciar o iframe sozinho a partir de uma div vazia.
    // Isso elimina o conflito entre o iframe manual e o YT.Player().
    let youtubeContainer = document.getElementById("youtubeContainer");
    if (youtubeContainer && videoId) {
        // Cria apenas uma div com o id que o YT.Player vai usar
        youtubeContainer.innerHTML = `<div id="youtubePlayer"></div>`;
    }

    if (musicaNome && musicaArtista) {
        buscarLetra(musicaArtista, musicaNome);
    }

    // 🔥 CORREÇÃO: Carrega a API do YouTube de forma segura
    // Evita carregar duas vezes se o script já foi inserido
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        let tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    }
}

// ================= BUSCAR MÚSICA =================
async function buscarMusica() {
    let termo = document.getElementById("buscaMusica").value.trim();

    if (!termo) {
        alert("Digite uma música!");
        return;
    }

    let div = document.getElementById("resultadosBusca");
    div.innerHTML = "<p style='color: white;'>Buscando no YouTube...</p>";

    let query = encodeURIComponent(termo + " karaoke");

    try {
        let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&key=${YOUTUBE_API_KEY}&maxResults=5`;
        let res = await fetch(url);
        let data = await res.json();

        div.innerHTML = "";

        if (!data || !data.items || data.items.length === 0) {
            div.innerHTML = "<p style='color:white;'>Nenhuma música encontrada.</p>";
            return;
        }

        data.items.forEach(m => {
            let item = document.createElement("div");
            item.className = "resultado-item";
            item.innerHTML = `<strong>${m.snippet.title}</strong><br><small>${m.snippet.channelTitle}</small>`;
            item.style.cursor = "pointer";
            item.style.padding = "10px";
            item.style.marginBottom = "5px";
            item.style.backgroundColor = "rgba(255,255,255,0.1)";
            item.style.borderRadius = "8px";
            item.style.color = "white";
            item.style.transition = "all 0.2s";

            item.onclick = () => {
                document.querySelectorAll("#resultadosBusca div").forEach(el => {
                    el.style.border = "none";
                    el.style.backgroundColor = "rgba(255,255,255,0.1)";
                });

                item.style.border = "2px solid #22c55e";
                item.style.backgroundColor = "rgba(34, 197, 94, 0.2)";

                selecionarMusica(m.snippet.title, m.snippet.channelTitle, m.id.videoId);
                console.log("Música selecionada:", m.snippet.title);
            };

            div.appendChild(item);
        });

    } catch (error) {
        console.error("Erro na busca:", error);
        div.innerHTML = "<p style='color:red;'>Erro ao buscar música. Verifique sua chave de API.</p>";
    }
}

// ================= SELECIONAR =================
function selecionarMusica(nome, artista, videoId) {
    localStorage.setItem("musicaSelecionada", nome);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
    localStorage.setItem("musicaAudio", videoId);
}

// ================= FINALIZAR =================
function finalizar() {
    window.location.href = "resultado.html";
}

// ================= VOLTAR =================
function voltarMenu() {
    // 🔥 CORREÇÃO: Remove apenas as chaves do karaokê, não apaga tudo
    localStorage.removeItem("musicaSelecionada");
    localStorage.removeItem("musicaNome");
    localStorage.removeItem("musicaArtista");
    localStorage.removeItem("musicaAudio");
    localStorage.removeItem("nome");
    window.location.href = "index.html";
}

// ================= BUSCAR LETRA =================
async function buscarLetra(artistaCanal, musicaTitulo) {
    let divLetra = document.querySelector(".letra");
    let loading = document.getElementById("loadingMusica");
    
    if (!divLetra || !loading) return;

    loading.style.display = "block";
    loading.innerText = "🎵 Procurando a melhor letra...";
    divLetra.innerHTML = "";
    linhasSincronizadas = [];
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }

    // 1. Limpeza Cirúrgica do Título do Vídeo
    // Pega o título (ex: "Adele - Hello (Karaoke Version)") e tira as sujeiras.
    // Ignoramos completamente o "artistaCanal", pois canais de karaokê estragam a busca.
    let tituloLimpo = musicaTitulo
        .replace(/\(.*?\)|\[.*?\]/g, " ") // Remove tudo entre () e []
        .replace(/karaoke|karaokê|instrumental|playback|cover|oficial|official|lyric|video|versão|version|áudio|audio|hd|hq/gi, " ")
        .replace(/\||"/g, " ") // Remove barras e aspas
        .replace(/\s+/g, " ").trim();

    // Criamos a busca global combinando tudo (Ex: "Adele Hello")
    // Isso garante precisão máxima e evita trazer músicas com o mesmo nome de outros artistas
    let queryGlobal = tituloLimpo.replace(/-/g, " ").replace(/\s+/g, " ").trim();

    // Criamos uma segunda variável apenas com a música para o caso de o canal
    // ter escrito um título muito ruim.
    let queryApenasMusica = tituloLimpo;
    if (tituloLimpo.includes("-")) {
        let partes = tituloLimpo.split("-");
        queryApenasMusica = partes[1] ? partes[1].trim() : tituloLimpo.replace(/-/g, "").trim();
    }

    console.log(`🔍 Busca Global (Alta Precisão): "${queryGlobal}"`);

    // TENTATIVA 1: LRCLIB — Focada em Letras Sincronizadas
    try {
        let res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(queryGlobal)}`);
        let data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            let t = data.find(t => t.syncedLyrics);
            if (t) { loading.style.display = "none"; processarLetraSincronizada(t.syncedLyrics, divLetra); return; }
            let tp = data.find(t => t.plainLyrics);
            if (tp) { loading.style.display = "none"; processarLetraSimples(tp.plainLyrics, divLetra); return; }
        }
    } catch (e) { console.log("LRCLIB falhou"); }

    // TENTATIVA 2: Some Random API — Backup com Alta Precisão
    try {
        let res = await fetch(`https://some-random-api.com/lyrics?title=${encodeURIComponent(queryGlobal)}`);
        let data = await res.json();
        if (data && data.lyrics) { loading.style.display = "none"; processarLetraSimples(data.lyrics, divLetra); return; }
    } catch (e) { console.log("SRA (Global) falhou"); }

    // TENTATIVA 3: Some Random API — Apenas Música (Último recurso)
    // Só usamos isso se a primeira tentativa falhar, para evitar "Falsos Positivos"
    if (queryApenasMusica && queryApenasMusica !== queryGlobal) {
        try {
            let res = await fetch(`https://some-random-api.com/lyrics?title=${encodeURIComponent(queryApenasMusica)}`);
            let data = await res.json();
            if (data && data.lyrics) { loading.style.display = "none"; processarLetraSimples(data.lyrics, divLetra); return; }
        } catch (e) { console.log("SRA (Apenas Música) falhou"); }
    }
 
    loading.innerText = "🎵 Nenhuma letra encontrada. Acompanhe pelo vídeo!";
}


 

// ================= PROCESSAR LETRA SINCRONIZADA =================
function processarLetraSincronizada(lrc, divLetra) {
    let linhas = lrc.split('\n');
    let leuAlgumaCoisa = false;

    linhas.forEach(linha => {
        let match = linha.match(/\[(\d{2,}):(\d{2}(?:\.\d{1,3})?)\](.*)/);
        if (match) {
            let tempoEmSegundos = (parseInt(match[1]) * 60) + parseFloat(match[2]);
            let texto = match[3].trim();

            let p = document.createElement("p");
            if (texto === "") {
                p.innerText = "♪";
                p.style.color = "transparent";
            } else {
                p.innerText = texto;
            }

            divLetra.appendChild(p);
            linhasSincronizadas.push({ tempo: tempoEmSegundos, elemento: p });
            leuAlgumaCoisa = true;
        }
    });

    if (!leuAlgumaCoisa) {
        divLetra.innerHTML = "";
        processarLetraSimples(lrc, divLetra);
    }
}

// ================= PROCESSAR LETRA SIMPLES =================
function processarLetraSimples(texto, divLetra) {
    let linhas = texto.split('\n');
    linhas.forEach(linha => {
        if (linha.trim() !== "") {
            let p = document.createElement("p");
            p.innerText = linha;
            divLetra.appendChild(p);
        }
    });
}

// ================= YOUTUBE PLAYER =================
// 🔥 CORREÇÃO PRINCIPAL: O player agora cria seu próprio iframe a partir da div#youtubePlayer
// Isso garante conexão 100% estável com a API
window.onYouTubeIframeAPIReady = function () {
    let videoId = localStorage.getItem("musicaAudio");

    if (!videoId) {
        console.warn("Sem vídeo selecionado para o player.");
        return;
    }

    // Verifica se a div alvo existe antes de criar o player
    let divPlayer = document.getElementById("youtubePlayer");
    if (!divPlayer) {
        console.warn("Elemento #youtubePlayer não encontrado no DOM.");
        return;
    }

    ytPlayer = new YT.Player('youtubePlayer', {
        height: '360',
        width: '100%',
        videoId: videoId, // 🔥 CORREÇÃO: passa o videoId direto para o player criar o iframe
        playerVars: {
            'rel': 0,
            'modestbranding': 1
        },
        events: {
            'onReady': (event) => {
                playerPronto = true;
                console.log("✅ Player pronto para o vídeo:", videoId);
                let loading = document.getElementById("loadingMusica");
                if (loading && !loading.innerText.includes("Nenhuma letra")) {
                    loading.innerText = "✅ Tudo pronto! Clique em 'Cantar' para começar:";
                }
            },
            'onError': (e) => {
                console.error("Erro no YouTube Player:", e.data);
                // Códigos de erro: 2=parâmetro inválido, 5=HTML5 error, 100=não encontrado, 101/150=embed bloqueado
                if (e.data === 101 || e.data === 150) {
                    alert("⚠️ Este vídeo não permite reprodução em sites externos. Escolha outra versão da música.");
                } else {
                    alert("⚠️ Erro ao carregar o vídeo (código " + e.data + "). Tente outra versão da música.");
                }
            },
            'onStateChange': (event) => {
                // Para o syncInterval quando o vídeo pausar ou terminar
                if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                    if (syncInterval && linhasSincronizadas.length === 0) {
                        // Só para o scroll automático (modo texto), não o de sincronia
                        clearInterval(syncInterval);
                        syncInterval = null;
                    }
                }
            }
        }
    });
};

// ================= BOTÃO CANTAR =================
function cantar() {
    if (!playerPronto || !ytPlayer || typeof ytPlayer.playVideo !== 'function') {
        alert("⏳ O player ainda está carregando. Aguarde um instante e tente de novo!");
        return;
    }

    ytPlayer.playVideo();

    let btnPlay = document.getElementById("btnPlay");
    if (btnPlay) btnPlay.style.display = "none";

    let loadingElem = document.getElementById("loadingMusica");
    if (loadingElem) loadingElem.innerText = "🎶 Solta o som!";

    let pontos = document.getElementById("pontuacao");
    if (pontos) {
        pontos.innerText = "⭐ " + Math.floor(Math.random() * 100);
    }

    iniciarAnimacaoLetra();
}

// ================= ANIMAÇÃO DE LETRA =================
function iniciarAnimacaoLetra() {
    const divLetra = document.querySelector(".letra");
    if (!divLetra) return;

    divLetra.style.opacity = "1";
    divLetra.classList.add("rodando");

    // 🔥 CORREÇÃO: Limpa intervalo anterior antes de criar um novo
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }

    if (linhasSincronizadas.length > 0) {
        // MODO KARAOKÊ SINCRONIZADO
        syncInterval = setInterval(() => {
            if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;

            let tempoAtual = ytPlayer.getCurrentTime();
            let linhaAtiva = -1;

            for (let i = 0; i < linhasSincronizadas.length; i++) {
                if (tempoAtual >= linhasSincronizadas[i].tempo - 0.3) {
                    linhaAtiva = i;
                } else {
                    break;
                }
            }

            if (linhaAtiva !== -1) {
                linhasSincronizadas.forEach(l => l.elemento.classList.remove("ativa"));

                let elementoAtual = linhasSincronizadas[linhaAtiva].elemento;
                elementoAtual.classList.add("ativa");

                let meioDaDiv = divLetra.clientHeight / 2;
                let scrollDestino = elementoAtual.offsetTop - divLetra.offsetTop - meioDaDiv + 20;
                divLetra.scrollTo({ top: scrollDestino, behavior: 'smooth' });
            }
        }, 200);

    } else {
        // MODO TEXTO: Rola devagar quando o vídeo está tocando
        syncInterval = setInterval(() => {
            if (ytPlayer && typeof ytPlayer.getPlayerState === 'function' && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                divLetra.scrollTop += 1;
            }
        }, 150);
    }
}