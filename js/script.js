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
    div.innerHTML = "Buscando...";

    let query = encodeURIComponent(termo + " karaoke instrumental");

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&key=${YOUTUBE_API_KEY}`;

    try {
        let res = await fetch(url);
        let data = await res.json();

        div.innerHTML = "";

        data.items.forEach(m => {

            let item = document.createElement("div");
            item.innerHTML = `<strong>${m.snippet.title}</strong>`;
            item.style.cursor = "pointer";
            item.style.padding = "10px";

            item.onclick = () => {
                selecionarMusica(
                    m.snippet.title,
                    m.snippet.channelTitle,
                    m.id.videoId
                );
                alert("✅ Música selecionada!");
            };

            div.appendChild(item);
        });

    } catch (error) {
        div.innerHTML = "Erro ao buscar música";
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
    localStorage.clear();
    window.location.href = "menu.html";
}