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

        // Configura o player de áudio
        let audioSrc = localStorage.getItem("musicaAudio");
        let audioPlayer = document.getElementById("audioPlayer");
        
        if (audioPlayer) {
            if (audioSrc) {
                audioPlayer.src = audioSrc;
                audioPlayer.style.display = "block";
                audioPlayer.onplay = () => iniciarTimerKaraoke(); // A letra anda se der Play
                audioPlayer.onpause = () => clearTimeout(timerKaraoke); // A letra para se der Pause
            } else {
                audioPlayer.style.display = "none";
                let loading = document.getElementById("loadingMusica");
                if (loading) {
                    loading.innerText = "⚠️ Sem prévia de áudio. A letra passará automaticamente.";
                }
                setTimeout(iniciarTimerKaraoke, 2000); // Inicia automático
            }
        }
    }
});

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

    clearTimeout(timerKaraoke);

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
    
    let url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=song&limit=5`;

    try {
        let res = await fetch(url);
        let data = await res.json();

        div.innerHTML = ""; 

        if (data.results.length === 0) {
            div.innerHTML = "Nenhuma música encontrada.";
            return;
        }

        data.results.forEach(m => {
            let item = document.createElement("div");
            item.innerHTML = `<strong>${m.trackName}</strong><br>${m.artistName}`;
            item.style.cursor = "pointer";
            item.style.padding = "10px";

            item.onclick = () => {
                document.querySelectorAll("#resultadosBusca div")
                    .forEach(el => el.style.border = "none");
                item.style.border = "2px solid #22c55e";
                selecionarMusica(m.trackName, m.artistName, m.previewUrl);
            };
            div.appendChild(item);
        });
    } catch (error) {
        div.innerHTML = "Erro ao buscar músicas. Tente novamente.";
        console.error("Erro na busca do iTunes:", error);
    }
}

// ================= SELECIONAR =================

function selecionarMusica(nome, artista, previewUrl) {
    localStorage.setItem("musicaSelecionada", nome + " - " + artista);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
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
    // Remove coisas como "(Remastered)", "(feat. XYZ)", "[Live]" que vêm do iTunes e quebram a busca
    let musicaLimpa = musica.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
    let termoDeBusca = `${musicaLimpa} ${artista}`;

    const displayLyrics = (letra) => {
        const linhas = letra.split("\n").filter(l => l.trim());
        div.innerHTML = "";
        linhas.forEach((l, i) => {
            div.innerHTML += `<p id="linha${i + 1}">${l.trim()}</p>`;
        });
        linhaAtual = 1;
        if (loading) loading.style.display = "none";
    };

    // --- TENTATIVA 1: Popcat API (Muito inteligente e rápida) ---
    try {
        div.innerHTML = "Buscando letra...";
        const url = `https://api.popcat.xyz/lyrics?song=${encodeURIComponent(termoDeBusca)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.lyrics) {
            displayLyrics(data.lyrics);
            return; // Sucesso!
        }
        throw new Error("Não encontrada no Popcat");
    } catch (error) {
        console.warn("Fonte 1 falhou, tentando alternativa...", error.message);
    }

    // --- TENTATIVA 2: LRCLIB (Com busca flexível) ---
    try {
        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(termoDeBusca)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.length > 0 && data[0].plainLyrics) {
            displayLyrics(data[0].plainLyrics);
            return; // Sucesso!
        }
        throw new Error("Não encontrada no LRCLIB");
    } catch (error) {
        console.error("Todas as buscas falharam.", error.message);
        div.innerHTML = `Desculpe, não encontramos a letra para "${musicaLimpa}". Tente buscar por outra versão.`;
        if (loading) {
            loading.innerText = "❌ Letra indisponível.";
        }
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