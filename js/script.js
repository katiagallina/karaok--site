// SUA CHAVE DO YOUTUBE (OK)
const YOUTUBE_API_KEY = "AIzaSyBhpdlWVIHHVDOg9rRBWMc5uyAAcEoqazA";

let ytPlayer = null;
let syncInterval = null;

// ================= INICIAR MODO LIVRE =================
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

// ================= CARREGAMENTO =================
if (window.location.pathname.includes("karaoke.html")) {

    let nome = localStorage.getItem("nome");
    let musicaSelecionada = localStorage.getItem("musicaSelecionada");

    document.getElementById("nomeMusica").innerText =
        musicaSelecionada || "Nenhuma música selecionada";

    let campo = document.getElementById("nomeUsuario");
    if (campo && nome) {
        campo.innerText = "Cantor: " + nome;
    }

    // 🔥 CHAMAR A LETRA (CORREÇÃO)
    let musicaNome = localStorage.getItem("musicaNome");
    let musicaArtista = localStorage.getItem("musicaArtista");

    if (musicaNome && musicaArtista) {
        buscarLetra(musicaArtista, musicaNome);
    }

    // 🔥 CARREGA API DO YOUTUBE
    let tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
}

// ================= YOUTUBE PLAYER =================
window.onYouTubeIframeAPIReady = function () {

    let videoId = localStorage.getItem("musicaAudio");

    if (!videoId) {
        console.warn("Sem vídeo selecionado");
        return;
    }

    ytPlayer = new YT.Player('youtubePlayer', {
        height: '250',
        width: '100%',
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: 1
        },
        events: {
            'onReady': () => {
                console.log("✅ Player pronto");
            },
            'onError': () => {
                alert("Erro ao carregar vídeo 😢");
            }
        }
    });
};

// ================= BOTÃO CANTAR =================
function cantar() {

    if (ytPlayer && ytPlayer.playVideo) {
        ytPlayer.playVideo();
    } else {
        alert("⚠️ Aguarde o carregamento do player!");
    }

    let pontos = document.getElementById("pontuacao");
    pontos.innerText = "⭐ " + Math.floor(Math.random() * 100);
}

// ================= BUSCAR MÚSICA =================
async function buscarMusica() {

    let termo = document.getElementById("buscaMusica").value.trim();

    if (!termo) {
        alert("Digite uma música!");
        return;
    }

    let div = document.getElementById("resultadosBusca");
    div.innerHTML = "Conectando aos servidores públicos...";

    let query = encodeURIComponent(termo + " karaoke");

    const servidores = [
        `https://pipedapi.kavin.rocks/search?q=${query}`,
        `https://pipedapi.tokhmi.xyz/search?q=${query}`,
        `https://pipedapi.smnz.de/search?q=${query}`
    ];

    try {
        let url = servidores[0]; // usa o primeiro servidor
        let res = await fetch(url);
        let data = await res.json();

        div.innerHTML = "";

        if (!data || !data.items || data.items.length === 0) {
            div.innerHTML = "Servidores ocupados. Tente novamente.";
            return;
        }

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

                let videoId = m.url.split("?v=")[1];
                if (videoId && videoId.includes("&")) {
                    videoId = videoId.split("&")[0];
                }

                selecionarMusica(m.title, m.uploaderName, videoId);

                alert("✅ Música selecionada!");
            };

            div.appendChild(item);
        });

    } catch (error) {
        div.innerHTML = "Erro ao buscar música";
    }
}

<<<<<<< HEAD
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
=======
        data.items.forEach(m => {

            let item = document.createElement("div");
            item.innerHTML = `<strong>${m.snippet.title}</strong>`;
>>>>>>> 55da59b0703314df58ee053b9b414b1f0fabe42f
            item.style.cursor = "pointer";
            item.style.padding = "10px";

            item.onclick = () => {
<<<<<<< HEAD
                document.querySelectorAll("#resultadosBusca div")
                    .forEach(el => el.style.border = "none");
                item.style.border = "2px solid #22c55e";
                
                // O Piped retorna a URL no formato /watch?v=ID, nós quebramos para pegar só o ID
                let videoId = m.url.split("?v=")[1];
                if (videoId && videoId.includes("&")) videoId = videoId.split("&")[0];

                selecionarMusica(m.title, m.uploaderName, videoId, 0);
=======
                selecionarMusica(
                    m.snippet.title,
                    m.snippet.channelTitle,
                    m.id.videoId
                );
                alert("✅ Música selecionada!");
>>>>>>> 55da59b0703314df58ee053b9b414b1f0fabe42f
            };

            div.appendChild(item);
<<<<<<< HEAD
    });
=======
        });

    } catch (error) {
        div.innerHTML = "Erro ao buscar música";
    }
>>>>>>> 55da59b0703314df58ee053b9b414b1f0fabe42f
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
    localStorage.clear();
    window.location.href = "menu.html";
}