// COLOQUE A SUA CHAVE DA API DO YOUTUBE AQUI DENTRO DAS ASPAS:
const YOUTUBE_API_KEY = "COLOQUE_SUA_CHAVE_AQUI";

function iniciarModoLivre() {

    let nome = document.getElementById("nome").value;
    let musicaSelecionada = localStorage.getItem("musicaSelecionada");

    if (nome === "") {
        alert("Digite seu nome!");
        return;
    }

    if (!musicaSelecionada) {
        alert("Selecione uma música!");
        return;
    }

    localStorage.setItem("nome", nome);
    window.location.href = "karaoke.html";
}

let pontos = 0;
let linhaAtual = 1;
let timerKaraoke;
let indiceAtual = -1; // Controle de sincronização do áudio
let offsetSincronia = 0; // Ajuste manual de tempo
let ytPlayer; // Controle global do player do YouTube
let syncInterval; // Timer de sincronização da letra

document.addEventListener("DOMContentLoaded", function () {

    if (window.location.pathname.includes("karaoke.html")) {

        pontos = 0;
        linhaAtual = 1;
        localStorage.setItem("pontuacao", 0);
        offsetSincronia = 0;

        let nome = localStorage.getItem("nome");
        let musicaSelecionada = localStorage.getItem("musicaSelecionada");

        if (musicaSelecionada) {
            document.getElementById("nomeMusica").innerText = musicaSelecionada;

            let musicaNome = localStorage.getItem("musicaNome");
            let musicaArtista = localStorage.getItem("musicaArtista");

            if (musicaNome && musicaArtista) {
                buscarLetra(musicaArtista, musicaNome);
            }

        } else {
            document.getElementById("nomeMusica").innerText = "Nenhuma música selecionada";
        }

        let campo = document.getElementById("nomeUsuario");
        if (campo) {
            if (nome) {
                campo.innerText = "Cantor: " + nome;
            } else { // Caso seja modo Duelo
                let j1 = localStorage.getItem("jogador1");
                let j2 = localStorage.getItem("jogador2");
                if (j1 && j2) {
                    campo.innerText = "Duelo: " + j1 + " VS " + j2;
                }
            }
        }

        // Injeta a API do YouTube na página
        let videoId = localStorage.getItem("musicaAudio");
        if (videoId && videoId !== "null") {
            let tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            let firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }
    }

    // Preencher nomes na tela de Duelo (VS)
    if (window.location.pathname.includes("vs.html")) {
        let j1 = localStorage.getItem("jogador1") || "Jogador 1";
        let j2 = localStorage.getItem("jogador2") || "Jogador 2";
        let elJ1 = document.getElementById("j1");
        let elJ2 = document.getElementById("j2");
        if (elJ1) elJ1.innerText = j1;
        if (elJ2) elJ2.innerText = j2;
    }
});

// ================= YOUTUBE PLAYER API =================
window.onYouTubeIframeAPIReady = function() {
    let videoId = localStorage.getItem("musicaAudio");
    if (!videoId || videoId === "null") return;

    ytPlayer = new YT.Player('youtubePlayer', {
        height: '250',
        width: '100%',
        videoId: videoId,
        playerVars: { 'playsinline': 1, 'controls': 1 },
        events: {
            'onStateChange': onPlayerStateChange,
            'onError': () => console.error("Erro no carregamento do vídeo do YouTube.")
        }
    });
};

function onPlayerStateChange(event) {
    // Se o vídeo estiver TOCANDO
    if (event.data == YT.PlayerState.PLAYING) {
        console.log("YouTube tocando!");
        if (!syncInterval) {
            syncInterval = setInterval(() => {
                if (ytPlayer && ytPlayer.getCurrentTime) {
                    sincronizarComAudio(ytPlayer.getCurrentTime());
                }
            }, 100); // Roda 10x por segundo pra manter fluidez
        }
    } else {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

// ================= SINCRONIA MANUAL =================
window.ajustarSincronia = function(valor) {
    offsetSincronia += valor;
    let display = document.getElementById("displaySincronia");
    if (display) {
        display.innerText = (offsetSincronia > 0 ? "+" : "") + offsetSincronia.toFixed(1) + "s";
    }
};

// ================= LETRA =================

function iniciarTimerKaraoke() {
    clearTimeout(timerKaraoke);

    avancarLinhaAutomatica();
}

function avancarLinhaAutomatica() {

    let linhas = document.querySelectorAll(".letra p");

    if (linhaAtual > linhas.length) return;

    linhas.forEach(l => {
        l.classList.remove("ativa");
        l.style.animationDuration = "";
    });

    let linha = document.getElementById("linha" + linhaAtual);
    let tempo = 3500; // Tempo base suave

    if (linha) {
        linha.classList.add("ativa");

        let tamanho = linha.innerText.length;
        tempo = Math.max(2500, tamanho * 120);

        linha.style.animationDuration = (tempo / 1000) + "s";

        // Rolagem automática se não houver áudio guiando
        linha.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    linhaAtual++;

    timerKaraoke = setTimeout(avancarLinhaAutomatica, tempo);
}

// ================= PONTUAÇÃO =================

function cantar() {
    // Dá o play no YouTube se o usuário clicar no botão Cantar
    if (typeof ytPlayer !== 'undefined' && ytPlayer.playVideo) {
        ytPlayer.playVideo();
    }

    pontos += Math.floor(Math.random() * 100);

    let el = document.getElementById("pontuacao");
    el.innerText = "⭐ " + pontos;

    el.style.transform = "scale(1.2)";
    setTimeout(() => el.style.transform = "scale(1)", 100);
}

// ================= FINALIZAR =================

function finalizar() {

    clearTimeout(timerKaraoke);

    localStorage.setItem("pontuacao", pontos);

    window.location.href = "resultado.html";
}

// ================= BUSCAR MÚSICA =================

async function buscarMusica() {

    let termo = document.getElementById("buscaMusica").value.toLowerCase().trim();

    if (!termo) {
        alert("Digite uma música!");
        return;
    }

    let div = document.getElementById("resultadosBusca");
    div.innerHTML = "Conectando aos servidores públicos...";
    
    let query = encodeURIComponent(termo + " karaoke");

    // Servidores Piped API (Muito mais modernos e estáveis, não bloqueiam o navegador)
    const servidores = [
        `https://pipedapi.kavin.rocks/search?q=${query}`,
        `https://pipedapi.tokhmi.xyz/search?q=${query}`,
        `https://pipedapi.smnz.de/search?q=${query}`
    ];

    let data = null;

    // Tenta buscar em cada servidor até um funcionar
    for (let url of servidores) {
        try {
            let res = await fetch(url);
            if (res.ok) {
                data = await res.json();
                break; // Se o servidor respondeu com sucesso, saímos do loop
            }
        } catch (error) {
            console.warn("Servidor alternativo falhou, tentando o próximo...", url);
        }
    }

    div.innerHTML = ""; 

    if (!data || !data.items || data.items.length === 0) {
        div.innerHTML = "Servidores superlotados no momento. Tente clicar em pesquisar novamente.";
        return;
    }

    // Filtra apenas os vídeos de música (ignora canais e playlists)
    let videos = data.items.filter(item => item.type === "stream").slice(0, 5);

    videos.forEach(m => {

            let item = document.createElement("div");
            item.innerHTML = `<strong>${m.title}</strong><br><small>${m.uploaderName}</small>`;
            item.style.cursor = "pointer";
            item.style.padding = "10px";

            item.onclick = () => {
                document.querySelectorAll("#resultadosBusca div")
                    .forEach(el => el.style.border = "none");
                item.style.border = "2px solid #22c55e";
                
                // O Piped retorna a URL no formato /watch?v=ID, nós quebramos para pegar só o ID
                let videoId = m.url.split("?v=")[1];
                if (videoId && videoId.includes("&")) videoId = videoId.split("&")[0];

                selecionarMusica(m.title, m.uploaderName, videoId, 0);
            };
            div.appendChild(item);
    });
}

// ================= SELECIONAR =================

function selecionarMusica(nome, artista, previewUrl, inicioLetra = 0) {
    localStorage.setItem("musicaSelecionada", nome + " - " + artista);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
    localStorage.setItem("musicaInicio", inicioLetra);
    
    if (previewUrl) {
        localStorage.setItem("musicaAudio", previewUrl);
    } else {
        localStorage.removeItem("musicaAudio");
    }
    localStorage.removeItem("musicaLetra");
}

// ================= LETRA =================

async function buscarLetra(artista, musica) {

    let div = document.querySelector(".letra");
    let loading = document.getElementById("loadingMusica");

    // O GRANDE SEGREDO: Limpar o nome da música!
    // Como os títulos do YouTube são "Sua Música (Karaoke Version)", precisamos limpá-los para a API de Letra achar!
    let musicaLimpa = musica.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/karaoke/i, '').replace(/instrumental/i, '').trim();
    let termoDeBusca = `${musicaLimpa} ${artista}`;
    let termoSimples = musicaLimpa; // Fallback caso o artista bloqueie a pesquisa

    const displayLyrics = (letra, isSynced = false) => {
        div.innerHTML = "";

        if (isSynced) {
            const timeRegEx = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
            const linhas = letra.split("\n");
            linhas.forEach((l, i) => {
                const match = timeRegEx.exec(l);
                if (match) {
                    const minutes = parseInt(match[1], 10);
                    const seconds = parseInt(match[2], 10);
                    // Converte milissegundos para manter precisão de centésimos e milésimos
                    const milliseconds = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
                    const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
                    const text = l.replace(timeRegEx, '').trim();
                    if (text) {
                        const wordsHTML = text.split(" ").map(w => `<span>${w}</span>`).join(" ");
                        div.innerHTML += `<p id="linha${i + 1}" data-time="${timeInSeconds}">${wordsHTML}</p>`;
                    }
                }
            });
            localStorage.setItem("temSincronia", "true");
        } else {
            const linhas = letra.split("\n").filter(l => l.trim());
            linhas.forEach((l, i) => {
                const wordsHTML = l.trim().split(" ").map(w => `<span>${w}</span>`).join(" ");
                div.innerHTML += `<p id="linha${i + 1}">${wordsHTML}</p>`;
            });
            localStorage.setItem("temSincronia", "false");
        }

        linhaAtual = 1;
        indiceAtual = -1; // Reset para a nova sincronização de áudio
        
        let controlesSincronia = document.getElementById("controlesSincronia");
        if (controlesSincronia) {
            controlesSincronia.style.display = isSynced ? "flex" : "none";
        }

        if (loading) {
            if (localStorage.getItem("musicaAudio")) {
                loading.style.display = "none";
            } else {
                loading.innerText = "⚠️ Áudio indisponível. Apenas leitura da letra.";
            }
        }
    };

    // Regra simples para validar a letra e tentar descartar resultados inválidos:
    const ehLetraValida = (texto) => {
        if (!texto || texto.length < 30) return false;
        
        let termosErro = ["instrumental", "not found", "lyrics not available"];
        if (termosErro.some(t => texto.toLowerCase().includes(t))) return false;
        
        // Verifica se ao menos uma parte do título aparece na letra para evitar letras de outras músicas
        let tituloPartes = musicaLimpa.toLowerCase().split(" ").filter(p => p.length > 3);
        if (tituloPartes.length > 0) {
            let temCorrespondencia = tituloPartes.some(p => texto.toLowerCase().includes(p));
            if (!temCorrespondencia) {
                console.warn(`Letra descartada: não inclui nenhuma palavra principal do título "${musicaLimpa}"`);
                return false;
            }
        }
        return true;
    };

    // --- TENTATIVA 1: LRCLIB (Busca com Artista - Sincronizada) ---
    try {
        div.innerHTML = "Buscando letra sincronizada...";
        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(termoDeBusca)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.length > 0) {
            // Procura ativamente por uma versão que tenha as marcações de tempo (syncedLyrics)
            let found = data.find(d => d.syncedLyrics && ehLetraValida(d.syncedLyrics));
            if (found) {
                return displayLyrics(found.syncedLyrics, true);
            }
        }
    } catch (error) {
        console.warn("LRCLIB com artista (Sincronizada) falhou...");
    }

    // --- TENTATIVA 2: LRCLIB (Apenas Nome - Sincronizada) ---
    try {
        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(termoSimples)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.length > 0) {
            let found = data.find(d => d.syncedLyrics && ehLetraValida(d.syncedLyrics));
            if (found) {
                return displayLyrics(found.syncedLyrics, true);
            }
        }
    } catch (error) {
        console.warn("LRCLIB simples (Sincronizada) falhou...");
    }

    // --- TENTATIVA 3: Popcat API (Não Sincronizada / Fallback) ---
    try {
        div.innerHTML = "Buscando letra simples...";
        const url = `https://api.popcat.xyz/lyrics?song=${encodeURIComponent(termoDeBusca)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.lyrics && ehLetraValida(data.lyrics)) {
            return displayLyrics(data.lyrics, false);
        }
    } catch (error) {
        console.warn("Popcat falhou...");
    }

    // --- TENTATIVA 4: LRCLIB (Busca com Artista - Não Sincronizada / Fallback) ---
    try {
        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(termoDeBusca)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.length > 0) {
            let found = data.find(d => d.plainLyrics && ehLetraValida(d.plainLyrics));
            if (found) {
                return displayLyrics(found.plainLyrics, false);
            }
        }
    } catch (error) {
        console.warn("Nenhuma API localizou uma letra confiável.");
    }

    // --- SE TUDO FALHAR ---
    div.innerHTML = `<p>Desculpe, não encontramos a letra correta para "${musicaLimpa}". Tente buscar por outra versão.</p>`;
    if (loading) loading.innerText = "❌ Letra indisponível.";
}

// ================= NAVEGAÇÃO / DUELOS =================

function irParaMusica() {
    let j1 = document.getElementById("jogador1").value;
    let j2 = document.getElementById("jogador2").value;

    if (!j1 || !j2) {
        alert("Preencha os dois jogadores!");
        return;
    }

    localStorage.setItem("jogador1", j1);
    localStorage.setItem("jogador2", j2);
    window.location.href = "musica-desafio.html";
}

function irParaVS() {
    let musicaSelecionada = localStorage.getItem("musicaSelecionada");
    if (!musicaSelecionada) {
        alert("Selecione uma música antes de continuar!");
        return;
    }
    window.location.href = "vs.html";
}

function iniciarDuelo() {
    window.location.href = "karaoke.html";
}

// ================= VOLTAR =================

function voltarMenu() {
    localStorage.removeItem("musicaSelecionada");
    localStorage.removeItem("musicaNome");
    localStorage.removeItem("musicaArtista");
    localStorage.removeItem("musicaLetra");

    window.location.href = "menu.html";
}

function sincronizarComAudio(tempoAtual) {
    let linhas = document.querySelectorAll(".letra p");

    if (linhas.length === 0) return;

    let inicioLetra = parseFloat(localStorage.getItem("musicaInicio")) || 0;
    let temSincronia = localStorage.getItem("temSincronia") === "true";

    let tempo = tempoAtual + offsetSincronia;

    if (temSincronia) {
        // Sincronização Exata (LRC - Estilo Spotify)
            let indiceEncontrado = -1;
            for (let i = 0; i < linhas.length; i++) {
                let tempoLinha = parseFloat(linhas[i].getAttribute("data-time"));
                if (tempo >= tempoLinha) {
                    indiceEncontrado = i;
                } else {
                    break; // Pode interromper porque estão em ordem cronológica
                }
            }

            if (indiceEncontrado !== -1) {
                if (indiceEncontrado !== indiceAtual) {
                    linhas.forEach(l => {
                        l.classList.remove("ativa");
                        l.querySelectorAll("span").forEach(s => s.classList.remove("cantada"));
                    });

                    let linhaAtiva = linhas[indiceEncontrado];
                    linhaAtiva.classList.add("ativa");
                    linhaAtiva.scrollIntoView({ behavior: "smooth", block: "center" });
                    indiceAtual = indiceEncontrado;
                }

                // Calcula o avanço das palavras
                let linhaAtiva = linhas[indiceAtual];
                let tempoInicio = parseFloat(linhaAtiva.getAttribute("data-time"));
                let tempoFim = tempoInicio + 3;
                if (indiceAtual + 1 < linhas.length) {
                    tempoFim = parseFloat(linhas[indiceAtual + 1].getAttribute("data-time"));
                }
                
                let duracaoMaxima = tempoFim - tempoInicio;
                let duracaoCantada = linhaAtiva.innerText.length * 0.1; // Estima 0.1s por caractere cantado
                // Evita que pausas muito longas (solo de bateria) façam a linha preencher muito devagar
                let duracaoAnimacao = Math.min(duracaoCantada, duracaoMaxima);
                duracaoAnimacao = Math.max(1, duracaoAnimacao); // Pelo menos 1 segundo

                let progresso = (tempo - tempoInicio) / duracaoAnimacao;
                
                let spans = linhaAtiva.querySelectorAll("span");
                if (spans.length > 0) {
                    let palavraAtual = Math.floor(progresso * spans.length);
                    spans.forEach((span, index) => {
                        if (index <= palavraAtual && progresso > 0) span.classList.add("cantada");
                        else span.classList.remove("cantada");
                    });
                }
            }
    } else {
        // Sincronização Estimada (Fallback Antigo - Sem LRC)
        let tempoCanto = tempo - inicioLetra;
        if (tempoCanto < 0) return;

        let tempoPorLinha = 3.5; 
        let indice = Math.floor(tempoCanto / tempoPorLinha);

        if (indice >= 0 && indice < linhas.length) {
            if (indice !== indiceAtual) {
                linhas.forEach(l => {
                    l.classList.remove("ativa");
                    l.querySelectorAll("span").forEach(s => s.classList.remove("cantada"));
                });

                let linhaAtiva = linhas[indice];
                if (linhaAtiva) {
                    linhaAtiva.classList.add("ativa");
                    linhaAtiva.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                indiceAtual = indice; 
            }

            // Preenchimento estimado das palavras
            let linhaAtiva = linhas[indiceAtual];
            let tempoInicio = inicioLetra + (indiceAtual * tempoPorLinha);
            let progresso = (tempo - tempoInicio) / tempoPorLinha;
            
            let spans = linhaAtiva.querySelectorAll("span");
            if (spans.length > 0) {
                let palavraAtual = Math.floor(progresso * spans.length);
                spans.forEach((span, index) => {
                    if (index <= palavraAtual && progresso > 0) span.classList.add("cantada");
                    else span.classList.remove("cantada");
                });
            }
        }
    }
}