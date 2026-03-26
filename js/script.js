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
let timerKaraoke;

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
        } else {
            // Inicia o timer se não houver música selecionada (música padrão do HTML)
            iniciarTimerKaraoke();
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

function iniciarTimerKaraoke() {
    clearTimeout(timerKaraoke);
    avancarLinhaAutomatica(); // Ativa a primeira linha imediatamente
}

function avancarLinhaAutomatica() {
    let letraDiv = document.querySelector(".letra");
    if (!letraDiv) return;
    
    let linhas = letraDiv.querySelectorAll("p");
    let totalLinhas = linhas.length;

    if (totalLinhas === 0) return;

    // remover destaque anterior
    for (let i = 1; i <= totalLinhas; i++) {
        let linha = document.getElementById("linha" + i);
        if (linha) {
            linha.classList.remove("ativa");
            linha.style.animationDuration = ""; // limpa o tempo personalizado antigo
        }
    }

    // destacar linha atual
    let linhaAtualEl = document.getElementById("linha" + linhaAtual);
    let tempoLinha = 3000; // Tempo padrão fallback
    
    if (linhaAtualEl) {
        linhaAtualEl.classList.add("ativa");
        linhaAtualEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // O pulo do gato: ajustar o tempo da animação com base no tamanho da frase!
        // Média de ~120ms por letra + pequena pausa para respiração
        let qtdCaracteres = linhaAtualEl.innerText.length;
        tempoLinha = Math.max(2000, (qtdCaracteres * 120) + 500);
        
        // Aplica o tempo dinâmico na animação do CSS para sincronizar o efeito de cor
        linhaAtualEl.style.animationDuration = (tempoLinha / 1000) + "s";
    }

    // próxima linha para a próxima iteração
    linhaAtual++;

    if (linhaAtual <= totalLinhas + 1) {
        timerKaraoke = setTimeout(avancarLinhaAutomatica, tempoLinha); // Agenda a próxima linha
    }
}

// FUNÇÃO CANTAR
function cantar() {
    // Apenas aumenta a pontuação, a letra avança sozinha agora
    pontos += Math.floor(Math.random() * 100) + 50;
    let pontuacaoEl = document.getElementById("pontuacao");
    pontuacaoEl.innerText = "⭐ " + pontos;
    
    // Efeito visual rápido (batida) ao pontuar
    pontuacaoEl.style.transform = "scale(1.2)";
    setTimeout(() => {
        pontuacaoEl.style.transform = "scale(1)";
    }, 100);
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

    let divResultados = document.getElementById("resultadosBusca");
    if (divResultados) {
        divResultados.innerHTML = "<p style='color: var(--neon-blue);'>Buscando músicas e verificando letras... ⏳</p>";
    }

    let url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=song&limit=10`;
    
    try {
        let response = await fetch(url);
        let data = await response.json();
        
        if (divResultados) {
            divResultados.innerHTML = "";
            
            if (data.results.length === 0) {
                divResultados.innerHTML = "<p style='color: var(--neon-red);'>Nenhuma música encontrada.</p>";
                return;
            }

            divResultados.innerHTML = "<p style='color: var(--neon-yellow);'>Filtrando músicas com letra disponível... ⏳</p>";

            let validTracks = [];

            // Verifica a letra de cada música encontrada antes de exibir (em paralelo)
            await Promise.all(data.results.map(async (musica) => {
                let nomeLimpo = musica.trackName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('-')[0].trim();
                let artistaLimpo = musica.artistName.split(/feat\.?/i)[0].split(',')[0].split('&')[0].trim();
                
                try {
                    let res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistaLimpo)}/${encodeURIComponent(nomeLimpo)}`);
                    if (res.ok) {
                        let letraData = await res.json();
                        if (letraData.lyrics) {
                            validTracks.push({
                                trackName: musica.trackName,
                                artistName: musica.artistName,
                                letra: letraData.lyrics
                            });
                        }
                    }
                } catch (e) {
                    // Ignora se der erro ou não tiver letra
                }
            }));

            divResultados.innerHTML = "";

            if (validTracks.length === 0) {
                divResultados.innerHTML = "<p style='color: var(--neon-red);'>Nenhuma música com letra foi encontrada para essa busca. Tente outro termo.</p>";
                return;
            }

            // Exibe APENAS as músicas que sabemos que têm letra
            validTracks.forEach(musica => {
                let item = document.createElement("div");
                item.style.background = "rgba(255, 255, 255, 0.1)";
                item.style.margin = "10px 0";
                item.style.padding = "10px";
                item.style.borderRadius = "8px";
                item.style.cursor = "pointer";
                item.innerHTML = `<strong>${musica.trackName}</strong> <br> <small>${musica.artistName}</small> <span style='float:right'>📝</span>`;
                
                item.onclick = function() {
                    selecionarMusica(musica.trackName, musica.artistName, musica.letra);
                };
                
                divResultados.appendChild(item);
            });
        }
    } catch (erro) {
        console.error("Erro ao buscar música:", erro);
        if (divResultados) {
            divResultados.innerHTML = "<p style='color: var(--neon-red);'>Erro ao buscar música. Tente novamente.</p>";
        }
    }
}

function selecionarMusica(nome, artista, letra) {
    let musicaCompleta = nome + " - " + artista;
    localStorage.setItem("musicaSelecionada", musicaCompleta);
    localStorage.setItem("musicaNome", nome);
    localStorage.setItem("musicaArtista", artista);
    
    // Já salvamos a letra aqui para evitar buscar duas vezes e correr risco de falhar
    if (letra) {
        localStorage.setItem("musicaLetra", letra);
    } else {
        localStorage.removeItem("musicaLetra");
    }

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

    letraDiv.innerHTML = "<p id='linha1'>Preparando letra...</p>";

    try {
        let letraSalva = localStorage.getItem("musicaLetra");
        let textoLetra = "";
        
        if (letraSalva) {
            textoLetra = letraSalva;
        } else {
            // Fallback caso não tenha vindo da pesquisa principal
            let musicaLimpa = musica.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').split('-')[0].trim();
            let artistaLimpo = artista.split(/feat\.?/i)[0].split(',')[0].split('&')[0].trim();
            let response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistaLimpo)}/${encodeURIComponent(musicaLimpa)}`);
            if (!response.ok) throw new Error("Letra não encontrada");
            let data = await response.json();
            if (!data.lyrics) throw new Error("Letra vazia");
            textoLetra = data.lyrics;
        }

        let linhas = textoLetra.replace(/Paroles de la chanson.*(\r\n|\n)/g, '').split('\n').filter(linha => linha.trim() !== "");
        let html = "";
        linhas.forEach((linha, index) => {
            html += `<p id="linha${index + 1}">♪ ${linha}</p>`;
        });
        letraDiv.innerHTML = html;
        linhaAtual = 1;
        iniciarTimerKaraoke();
    } catch (erro) {
        console.error("Erro ao buscar letra:", erro);
        letraDiv.innerHTML = `<p id="linha1">♪ Letra não encontrada.</p><p id="linha2">♪ Solte a voz e cante com o coração!</p><p id="linha3">♪ (Modo Instrumental)</p>`;
        linhaAtual = 1;
        iniciarTimerKaraoke(); // Inicia o timer mesmo na tela de fallback
    }
}