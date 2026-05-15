const fs = require('fs');
let lines = fs.readFileSync('c:/Users/aluno12/Desktop/karaoke-site/js/script.js', 'utf8').split(/\r?\n/);
const fix = `}

async function buscarNaLrclib(tentativas) {
    const tentativasAtivas = tentativas.slice(0, 6);
    let promessas = [];

    tentativasAtivas.forEach(tentativa => {
        if (tentativa.artist) {
            promessas.push(fetchLrclib(\`https://lrclib.net/api/search?track_name=\${encodeURIComponent(tentativa.song)}&artist_name=\${encodeURIComponent(tentativa.artist)}\`));
        }
        promessas.push(fetchLrclib(\`https://lrclib.net/api/search?q=\${encodeURIComponent(tentativa.query)}\`));
    });

    return new Promise((resolve) => {
        let pendentes = promessas.length;
        let melhorResultadoSemSync = null;
        let melhorResultadoRelaxado = null;
        let resolvido = false;

        if (pendentes === 0) {
            resolve(null);
            return;
        }

        const finalizarTentativa = () => {
            pendentes--;
            if (pendentes === 0 && !resolvido) {
                resolvido = true;
                resolve(melhorResultadoSemSync || melhorResultadoRelaxado);
            }
        };

        promessas.forEach(p => {
            p.then(data => {
                if (resolvido) return;

                try {
                    if (data && Array.isArray(data) && data.length > 0) {
                        const candidatosPontuados = data
                            .map((track) => ({
                                track,
                                score: calcularScoreCompatibilidadeLetra(track, tentativasAtivas),
                                compatibilidade: analisarCompatibilidadeLetra(track, tentativasAtivas)
                            }))
                            .sort((a, b) => {
                                if (!!b.track.syncedLyrics !== !!a.track.syncedLyrics) {
                                    return Number(!!b.track.syncedLyrics) - Number(!!a.track.syncedLyrics);
                                }
                                if (b.compatibilidade.tituloScore !== a.compatibilidade.tituloScore) {
                                    return b.compatibilidade.tituloScore - a.compatibilidade.tituloScore;
                                }
                                if (b.compatibilidade.total !== a.compatibilidade.total) {
                                    return b.compatibilidade.total - a.compatibilidade.total;
                                }
                                return b.score - a.score;
                            });

                        const candidatosValidos = data
                            .map((track) => ({
                                track,
                                score: calcularScoreCompatibilidadeLetra(track, tentativasAtivas),
                                compatibilidade: analisarCompatibilidadeLetra(track, tentativasAtivas)
                            }))
                            .filter((item) => item.compatibilidade.aceito)
                            .sort((a, b) => {
                                if (!!b.track.syncedLyrics !== !!a.track.syncedLyrics) {
                                    return Number(!!b.track.syncedLyrics) - Number(!!a.track.syncedLyrics);
                                }
                                if (b.compatibilidade.total !== a.compatibilidade.total) {
                                    return b.compatibilidade.total - a.compatibilidade.total;
                                }
                                return b.score - a.score;
                            });

                        const comSync = candidatosValidos.find((item) => item.track.syncedLyrics);
                        if (comSync) {
                            resolvido = true;
                            resolve(comSync.track);
                            return;
                        } else if (!melhorResultadoSemSync && candidatosValidos[0]) {
                            melhorResultadoSemSync = candidatosValidos[0].track;
                        }

                        if (!melhorResultadoRelaxado && candidatosPontuados[0]?.compatibilidade?.tituloScore >= 92) {
                            melhorResultadoRelaxado = candidatosPontuados[0].track;
                        }
                    }
                } catch (e) {
                    console.error("Erro interno no processamento do LRCLIB:", e);
                }

                finalizarTentativa();
            }).catch(e => {
                console.error("Erro na promessa do LRCLIB:", e);
                if (resolvido) return;
                finalizarTentativa();
            });
        });
    });
}

async function fetchLyricsOvh(url) {
    const res = await fetchComTimeout(url, 5000);
    if (!res || !res.ok) return null;
    try {
        const data = await res.json();
        return data && data.lyrics ? data.lyrics : null;
    } catch (e) {
        return null;
    }
}

async function buscarNaLyricsOvh(tentativas) {
    const tentativasAtivas = tentativas.filter(t => t.artist && t.song).slice(0, 6);

    return new Promise((resolve) => {
        let pendentes = tentativasAtivas.length;
        let resolvido = false;

        if (pendentes === 0) {
            resolve(null);
            return;
        }

        const finalizarTentativa = () => {
            pendentes--;
            if (pendentes === 0 && !resolvido) {
                resolvido = true;
                resolve(null);
            }
        };

        tentativasAtivas.forEach(tentativa => {
            fetchLyricsOvh(\`https://api.lyrics.ovh/v1/\${encodeURIComponent(tentativa.artist)}/\${encodeURIComponent(tentativa.song)}\`)
                .then(lyrics => {
                    if (resolvido) return;

                    if (lyrics) {
                        resolvido = true;
                        resolve(lyrics);
                        return;
                    }

                    finalizarTentativa();
                })
                .catch(e => {
                    console.error("Erro na promessa do LyricsOvh:", e);
                    if (resolvido) return;
                    finalizarTentativa();
                });
        });
    });
}

function extrairLinhasLimpas(lyrics) {
    return String(lyrics || "")
        .split(/\\r?\\n/)
        .map((linha) => linha.trim())
        .filter(Boolean);
}

function obterDuracaoAtualMusica() {
    try {
        if (ytPlayer && typeof ytPlayer.getDuration === "function") {
            const duracao = Number(ytPlayer.getDuration());
            if (Number.isFinite(duracao) && duracao > 0) return duracao;
        }
    } catch (erro) {
        return 0;
    }

    return 0;
}`;
lines.splice(1653, 10, ...fix.split('\n'));
fs.writeFileSync('c:/Users/aluno12/Desktop/karaoke-site/js/script.js', lines.join('\n'));
console.log("Success");
