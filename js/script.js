function iniciarModoLivre() {
    let campoNome = document.getElementById("nome");
    let nome = campoNome.value;

    if (nome === "") {
        alert("Digite seu nome!");
        return;
    }

    // salvar nome (opcional)
    localStorage.setItem("nome", nome);

    // limpar campo
    campoNome.value = "";

    // ir para tela de karaokê
    window.location.href = "karaoke.html";
}
let pontos = 0;
let linhaAtual = 1;

// MOSTRAR NOME
document.addEventListener("DOMContentLoaded", function () {
    if (window.location.pathname.includes("karaoke.html")) {
        let nome = localStorage.getItem("nome");
        let vez = localStorage.getItem("vez");

        // Mostrar música selecionada
        let musicaSelecionada = localStorage.getItem("musicaSelecionada");
        if (musicaSelecionada) {
            let tituloMusica = document.createElement("h3");
            tituloMusica.innerText = "🎵 " + musicaSelecionada;
            tituloMusica.style.color = "#cbd5f5";
            tituloMusica.style.marginBottom = "20px";
            document.querySelector(".container").insertBefore(tituloMusica, document.querySelector(".letra"));

            // Buscar letra da música dinamicamente
            let musicaNome = localStorage.getItem("musicaNome");
            let musicaArtista = localStorage.getItem("musicaArtista");
            if (musicaNome && musicaArtista) {
                buscarLetra(musicaArtista, musicaNome);
            }
        }

        // MODO DESAFIO
        if (vez) {
            let j1 = localStorage.getItem("jogador1");
            let j2 = localStorage.getItem("jogador2");
            let campo = document.getElementById("quemCanta");
            if (campo) {
                if (vez === "jogador1") {
                    campo.innerText = j1 + " está cantando 🎤";
                } else {
                    campo.innerText = j2 + " está cantando 🎤";
                }
            }
        } else {
            // MODO LIVRE
            if (nome) {
                let campo = document.getElementById("nomeUsuario");
                if (campo) {
                    campo.innerText = "Cantor: " + nome;
                }
            }
        }
    }
});


// FUNÇÃO CANTAR
function cantar() {
    let letraDiv = document.querySelector(".letra");
    if (!letraDiv) return;
    
    let linhas = letraDiv.querySelectorAll("p");
    let totalLinhas = linhas.length;

    if (totalLinhas === 0) return;

    // remover destaque anterior
    for (let i = 1; i <= totalLinhas; i++) {
        let linha = document.getElementById("linha" + i);
        if (linha) linha.classList.remove("ativa");
    }

    // destacar linha atual
    let linhaAtualEl = document.getElementById("linha" + linhaAtual);
    if (linhaAtualEl) {
        linhaAtualEl.classList.add("ativa");
        linhaAtualEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // aumentar pontuação
    pontos += Math.floor(Math.random() * 500);
    document.getElementById("pontuacao").innerText = "⭐ " + pontos;

    // próxima linha
    linhaAtual++;

    if (linhaAtual > totalLinhas) {
        linhaAtual = 1;
    }
}

// FINALIZAR
function finalizar() {

    let vez = localStorage.getItem("vez");

    // MODO DESAFIO
    if (vez) {

        let pontos = localStorage.getItem("pontuacao") || 0;

        // jogador 1 terminou
        if (vez === "jogador1") {

            localStorage.setItem("pontosJ1", pontos);

            // agora é jogador 2
            localStorage.setItem("vez", "jogador2");

            // resetar pontuação
            localStorage.setItem("pontuacao", 0);

            window.location.href = "karaoke.html";

        } else {

            // jogador 2 terminou
            localStorage.setItem("pontosJ2", pontos);

            window.location.href = "resultado-desafio.html";
        }

    } else {

        // MODO LIVRE
        localStorage.setItem("pontuacao", pontos);
        window.location.href = "resultado.html";
    }
}

document.addEventListener("DOMContentLoaded", function () {
    if (window.location.pathname.includes("resultado.html")) {
        let nome = localStorage.getItem("nome");
        let pontos = localStorage.getItem("pontuacao");

        salvarRanking(nome, pontos);

        if (nome) {
            document.getElementById("nomeFinal").innerText = "Cantor: " + nome;
        }

        if (pontos) {
            document.getElementById("pontuacaoFinal").innerText = "⭐ " + pontos;

            // avaliação por estrelas
            let avaliacao = "";
            if (pontos < 500) {
                avaliacao = "⭐";
            } else if (pontos < 1000) {
                avaliacao = "⭐⭐";
            } else if (pontos < 1500) {
                avaliacao = "⭐⭐⭐";
            } else if (pontos < 2000) {
                avaliacao = "⭐⭐⭐⭐";
            } else {
                avaliacao = "⭐⭐⭐⭐⭐";
            }

            document.getElementById("avaliacao").innerText = "Avaliação: " + avaliacao;
        }
    }
});
// SALVAR NO RANKING
function salvarRanking(nome, pontos) {

    let ranking = JSON.parse(localStorage.getItem("ranking")) || [];

    ranking.push({
        nome: nome,
        pontos: parseInt(pontos)
    });

    // ordenar do maior para o menor
    ranking.sort((a, b) => b.pontos - a.pontos);

    // salvar novamente
    localStorage.setItem("ranking", JSON.stringify(ranking));
}

// MOSTRAR RANKING
function mostrarRanking() {

    let lista = document.getElementById("listaRanking");
    let ranking = JSON.parse(localStorage.getItem("ranking")) || [];

    lista.innerHTML = "";

    ranking.forEach((jogador, index) => {

        let item = document.createElement("li");

        item.innerText = `${index + 1}º - ${jogador.nome} ⭐ ${jogador.pontos}`;

        lista.appendChild(item);
    });
}

if (window.location.pathname.includes("ranking.html")) {
    mostrarRanking();
}

function irParaMusica() {

    let campoJ1 = document.getElementById("jogador1");
    let campoJ2 = document.getElementById("jogador2");

    let j1 = campoJ1.value;
    let j2 = campoJ2.value;

    if (j1 === "" || j2 === "") {
        alert("Digite os dois nomes!");
        return;
    }

    // salvar nomes
    localStorage.setItem("jogador1", j1);
    localStorage.setItem("jogador2", j2);

    // limpar campos
    campoJ1.value = "";
    campoJ2.value = "";

    // ir para escolha de música
    window.location.href = "musica-desafio.html";
}

function irParaVS() {
    window.location.href = "vs.html";
}

if (window.location.pathname.includes("vs.html")) {

    let j1 = localStorage.getItem("jogador1");
    let j2 = localStorage.getItem("jogador2");

    document.getElementById("j1").innerText = j1;
    document.getElementById("j2").innerText = j2;
}

function iniciarDuelo() {

    // definir quem canta primeiro
    localStorage.setItem("vez", "jogador1");

    window.location.href = "karaoke.html";
}

if (window.location.pathname.includes("resultado-desafio.html")) {

    let j1 = localStorage.getItem("jogador1");
    let j2 = localStorage.getItem("jogador2");

    let p1 = parseInt(localStorage.getItem("pontosJ1")) || 0;
    let p2 = parseInt(localStorage.getItem("pontosJ2")) || 0;

    document.getElementById("resultadoJ1").innerText = j1 + " ⭐ " + p1;
    document.getElementById("resultadoJ2").innerText = j2 + " ⭐ " + p2;

    let vencedor = "";

    if (p1 > p2) {
        vencedor = j1 + " venceu! 🏆";
    } else if (p2 > p1) {
        vencedor = j2 + " venceu! 🏆";
    } else {
        vencedor = "Empate!";
    }

    document.getElementById("vencedor").innerText = vencedor;
}

// BUSCAR MÚSICA NA API DO ITUNES
async function buscarMusica() {
    let termo = document.getElementById("buscaMusica").value;
    if (termo.trim() === "") {
        alert("Digite o nome de uma música para buscar!");
        return;
    }

    let url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=song&limit=5`;
    
    try {
        let response = await fetch(url);
        let data = await response.json();
        
        let divResultados = document.getElementById("resultadosBusca");
        if (divResultados) {
            divResultados.innerHTML = "";
            
            if (data.results.length === 0) {
                divResultados.innerHTML = "<p>Nenhuma música encontrada.</p>";
                return;
            }

            data.results.forEach(musica => {
                let item = document.createElement("div");
                item.style.background = "rgba(255, 255, 255, 0.1)";
                item.style.margin = "10px 0";
                item.style.padding = "10px";
                item.style.borderRadius = "8px";
                item.style.cursor = "pointer";
                item.innerHTML = `<strong>${musica.trackName}</strong> <br> <small>${musica.artistName}</small>`;
                
                item.onclick = function() {
                    selecionarMusica(musica.trackName, musica.artistName);
                };
                
                divResultados.appendChild(item);
            });
        }
    } catch (erro) {
        console.error("Erro ao buscar música:", erro);
        alert("Erro ao buscar música. Tente novamente mais tarde.");
    }
}

function selecionarMusica(nome, artista) {
    let musicaCompleta = nome + " - " + artista;
    localStorage.setItem("musicaSelecionada", musicaCompleta);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
    
    let inputBusca = document.getElementById("buscaMusica");
    if (inputBusca) {
        inputBusca.value = ""; // Limpa o campo de busca
    }
    
    let divResultados = document.getElementById("resultadosBusca");
    if (divResultados) {
        divResultados.innerHTML = `<p style="color: #22c55e;">Música selecionada: <strong>${musicaCompleta}</strong></p>`;
    }
}

// BUSCAR LETRA NA API LYRICS.OVH
async function buscarLetra(artista, musica) {
    let letraDiv = document.querySelector(".letra");
    if (!letraDiv) return;

    letraDiv.innerHTML = "<p id='linha1'>Procurando letra na internet...</p>";

    try {
        let response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artista)}/${encodeURIComponent(musica)}`);
        if (!response.ok) throw new Error("Letra não encontrada");
        
        let data = await response.json();

        if (data.lyrics) {
            let linhas = data.lyrics.replace(/Paroles de la chanson.*(\r\n|\n)/g, '').split('\n').filter(linha => linha.trim() !== "");
            let html = "";
            linhas.forEach((linha, index) => {
                html += `<p id="linha${index + 1}">♪ ${linha}</p>`;
            });
            letraDiv.innerHTML = html;
        } else {
            throw new Error("Letra vazia");
        }
    } catch (erro) {
        console.error("Erro ao buscar letra:", erro);
        letraDiv.innerHTML = `<p id="linha1">♪ Letra não encontrada.</p><p id="linha2">♪ Solte a voz e cante com o coração!</p><p id="linha3">♪ (Modo Instrumental)</p>`;
    }
}