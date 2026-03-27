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
let ytPlayer;
let progressInterval;

document.addEventListener("DOMContentLoaded", function () {

    if (window.location.pathname.includes("karaoke.html")) {

        pontos = 0;
        linhaAtual = 1;
        localStorage.setItem("pontuacao", 0);

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

        if (nome) {
            let campo = document.getElementById("nomeUsuario");
            if (campo) {
                campo.innerText = "Cantor: " + nome;
            }
        }
    }
});

// ================= LETRA =================

function iniciarTimerKaraoke() {
    clearTimeout(timerKaraoke);

    if (!ytPlayer || ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) return;

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

    let tempo = 3000;

    if (linha) {
        linha.classList.add("ativa");

        let tamanho = linha.innerText.length;
        tempo = Math.max(2000, tamanho * 120);

        linha.style.animationDuration = (tempo / 1000) + "s";
    }

    linhaAtual++;

    timerKaraoke = setTimeout(avancarLinhaAutomatica, tempo);
}

// ================= PONTUAÇÃO =================

function cantar() {
    pontos += Math.floor(Math.random() * 100);

    let el = document.getElementById("pontuacao");
    el.innerText = "⭐ " + pontos;

    el.style.transform = "scale(1.2)";
    setTimeout(() => el.style.transform = "scale(1)", 100);
}

// ================= FINALIZAR =================

function finalizar() {

    if (ytPlayer) ytPlayer.stopVideo();

    clearTimeout(timerKaraoke);
    clearInterval(progressInterval);

    localStorage.setItem("pontuacao", pontos);

    window.location.href = "resultado.html";
}

// ================= BUSCAR MÚSICA =================

async function buscarMusica() {

    let termo = document.getElementById("buscaMusica").value;

    if (!termo) {
        alert("Digite uma música!");
        return;
    }

    let div = document.getElementById("resultadosBusca");
    div.innerHTML = "Buscando...";

    let url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=song&limit=10`;

    let res = await fetch(url);
    let data = await res.json();

    let musicas = data.results.slice(0, 5);
    let validas = [];

    await Promise.all(musicas.map(async (m) => {
        try {
            let r = await fetch(`https://api.lyrics.ovh/v1/${m.artistName}/${m.trackName}`);
            if (r.ok) {
                let l = await r.json();
                if (l.lyrics) {
                    validas.push({
                        nome: m.trackName,
                        artista: m.artistName,
                        letra: l.lyrics
                    });
                }
            }
        } catch {}
    }));

    div.innerHTML = "";

    validas.forEach(m => {

        let item = document.createElement("div");

        item.innerHTML = `<strong>${m.nome}</strong><br>${m.artista}`;
        item.style.cursor = "pointer";
        item.style.padding = "10px";

        item.onclick = () => {

            document.querySelectorAll("#resultadosBusca div")
                .forEach(el => el.style.border = "none");

            item.style.border = "2px solid #22c55e";

            selecionarMusica(m.nome, m.artista, m.letra);
        };

        div.appendChild(item);
    });
}

// ================= SELECIONAR =================

function selecionarMusica(nome, artista, letra) {

    localStorage.setItem("musicaSelecionada", nome + " - " + artista);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
    localStorage.setItem("musicaLetra", letra);
}

// ================= LETRA =================

async function buscarLetra(artista, musica) {

    let div = document.querySelector(".letra");

    let letra = localStorage.getItem("musicaLetra");

    if (!letra) {
        let r = await fetch(`https://api.lyrics.ovh/v1/${artista}/${musica}`);
        let d = await r.json();
        letra = d.lyrics;
    }

    let linhas = letra.split("\n").filter(l => l.trim());

    div.innerHTML = "";

    linhas.forEach((l, i) => {
        div.innerHTML += `<p id="linha${i + 1}">${l}</p>`;
    });

    linhaAtual = 1;
}

// ================= PLAYER =================

function onYouTubeIframeAPIReady() {

    let musica = localStorage.getItem("musicaSelecionada");

    if (!musica) return;

    ytPlayer = new YT.Player('youtube-player', {
        height: '215',
        width: '100%',
        playerVars: {
            autoplay: 1,
            controls: 0,
            listType: 'search',
            list: musica + " karaoke instrumental"
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange
        }
    });
}

function onPlayerReady(e) {
    e.target.playVideo();

    let loading = document.getElementById("loadingMusica");
    if (loading) loading.style.display = "none";
}

function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.PLAYING) {
        iniciarTimerKaraoke();
    } else {
        clearTimeout(timerKaraoke);
    }
}

// ================= VOLTAR =================

function voltarMenu() {

    localStorage.removeItem("musicaSelecionada");
    localStorage.removeItem("musicaNome");
    localStorage.removeItem("musicaArtista");
    localStorage.removeItem("musicaLetra");

    window.location.href = "index.html";
}