// Simulador de TMDB, TVmaze e Wikidata — SOMENTE para testes e para `npm run demo`.
// Devolve JSON no mesmo formato das APIs reais. Os identificadores (9000xx) são fictícios de propósito:
// os metadados descrevem obras reais, mas nada aqui vem do TMDB de verdade.

const M = (id, title, original, date, runtime, genres, dir, cast, country, lang, overview, score, votes, imdb = null) => ({
  id, title, original_title: original, release_date: date, runtime, genres: genres.map((name, i) => ({ id: i + 1, name })),
  credits: { crew: dir.map((name, i) => ({ id: id * 10 + i, name, job: 'Director' })), cast: cast.map((name, i) => ({ id: id * 100 + i, name, character: null })) },
  production_countries: country.map((c) => ({ iso_3166_1: c })), original_language: lang, overview, vote_average: score, vote_count: votes,
  imdb_id: imdb, poster_path: `/fx${id}.jpg`, backdrop_path: `/bx${id}.jpg`, popularity: 100 - (id % 90), tagline: '', status: 'Released',
  production_companies: [], homepage: '',
});

export const MOVIES = [
  M(900001, 'Cidade de Deus', 'Cidade de Deus', '2002-08-30', 130, ['Crime', 'Drama'], ['Fernando Meirelles', 'Kátia Lund'], ['Alexandre Rodrigues', 'Leandro Firmino', 'Phellipe Haagensen'], ['BR'], 'pt', 'Na favela que dá nome ao filme, dois garotos seguem caminhos opostos: um sonha em ser fotógrafo, o outro em dominar o tráfico.', 8.4, 6200, 'tt0317248'),
  M(900002, 'Pulp Fiction: Tempo de Violência', 'Pulp Fiction', '1994-10-14', 154, ['Crime', 'Suspense'], ['Quentin Tarantino'], ['John Travolta', 'Samuel L. Jackson', 'Uma Thurman'], ['US'], 'en', 'Histórias de gângsteres, um boxeador e um casal de assaltantes se cruzam em Los Angeles.', 8.5, 27000, 'tt0110912'),
  M(900003, 'Blade Runner: O Caçador de Androides', 'Blade Runner', '1982-06-25', 117, ['Ficção científica', 'Suspense'], ['Ridley Scott'], ['Harrison Ford', 'Rutger Hauer', 'Sean Young'], ['US'], 'en', 'Em uma Los Angeles chuvosa de 2019, um policial caça androides que fugiram das colônias espaciais.', 7.9, 13000, 'tt0083658'),
  M(900004, 'Os Caçadores da Arca Perdida', 'Raiders of the Lost Ark', '1981-06-12', 115, ['Aventura', 'Ação'], ['Steven Spielberg'], ['Harrison Ford', 'Karen Allen'], ['US'], 'en', 'O arqueólogo Indiana Jones corre contra os nazistas para encontrar a Arca da Aliança.', 7.9, 12500, 'tt0082971'),
  M(900005, 'Parasita', '기생충', '2019-05-30', 133, ['Comédia', 'Suspense', 'Drama'], ['Bong Joon-ho'], ['Song Kang-ho', 'Choi Woo-shik', 'Park So-dam'], ['KR'], 'ko', 'Uma família pobre se infiltra, um a um, na casa de uma família rica.', 8.5, 17500, 'tt6751668'),
  M(900006, 'Tempos Modernos', 'Modern Times', '1936-02-05', 87, ['Comédia', 'Drama'], ['Charlie Chaplin'], ['Charlie Chaplin', 'Paulette Goddard'], ['US'], 'en', 'Um operário de fábrica tenta sobreviver à era da produção em massa e ao desemprego.', 8.2, 7800, 'tt0027977'),
  M(900007, 'O Iluminado', 'The Shining', '1980-05-23', 146, ['Terror', 'Suspense'], ['Stanley Kubrick'], ['Jack Nicholson', 'Shelley Duvall'], ['GB', 'US'], 'en', 'Um escritor aceita cuidar de um hotel isolado no inverno, e o lugar começa a tomar conta da família.', 8.2, 18000, 'tt0081505'),
  M(900008, 'Central do Brasil', 'Central do Brasil', '1998-04-03', 110, ['Drama'], ['Walter Salles'], ['Fernanda Montenegro', 'Vinícius de Oliveira'], ['BR'], 'pt', 'Uma ex-professora que escreve cartas na estação de trem leva um menino órfão em busca do pai.', 7.9, 1500, 'tt0120324'),
  M(900009, 'Viagem a Tóquio', '東京物語', '1953-11-03', 136, ['Drama'], ['Yasujirō Ozu'], ['Chishū Ryū', 'Setsuko Hara'], ['JP'], 'ja', 'Um casal de idosos visita os filhos adultos em Tóquio e descobre o quanto a vida os afastou.', 8.2, 1100, 'tt0046438'),
  M(900010, 'Mad Max: Estrada da Fúria', 'Mad Max: Fury Road', '2015-05-13', 120, ['Ação', 'Aventura', 'Ficção científica'], ['George Miller'], ['Tom Hardy', 'Charlize Theron'], ['AU', 'US'], 'en', 'Em um deserto pós-apocalíptico, uma guerreira foge de um tirano com as esposas dele.', 7.6, 22000, 'tt1392190'),
  M(900011, 'A Viagem de Chihiro', '千と千尋の神隠し', '2001-07-20', 125, ['Animação', 'Fantasia', 'Família'], ['Hayao Miyazaki'], ['Rumi Hiiragi', 'Miyu Irino'], ['JP'], 'ja', 'Uma menina se perde em um mundo de espíritos e precisa trabalhar numa casa de banhos para salvar os pais.', 8.5, 16000, 'tt0245429'),
  M(900012, 'O Poderoso Chefão', 'The Godfather', '1972-03-14', 175, ['Crime', 'Drama'], ['Francis Ford Coppola'], ['Marlon Brando', 'Al Pacino', 'James Caan'], ['US'], 'en', 'O patriarca de uma família mafiosa passa o comando ao filho mais novo, relutante.', 8.7, 20000, 'tt0068646'),
  M(900013, 'Wall-E', 'WALL·E', '2008-06-22', 98, ['Animação', 'Ficção científica', 'Família'], ['Andrew Stanton'], ['Ben Burtt', 'Elissa Knight'], ['US'], 'en', 'Um robô solitário que limpa a Terra abandonada encontra uma sonda e segue-a pelo espaço.', 8.1, 18000, 'tt0910970'),
  M(900014, 'Janela Indiscreta', 'Rear Window', '1954-08-04', 112, ['Suspense', 'Mistério'], ['Alfred Hitchcock'], ['James Stewart', 'Grace Kelly'], ['US'], 'en', 'Preso a uma cadeira de rodas, um fotógrafo suspeita que o vizinho cometeu um crime.', 8.4, 6800, 'tt0047396'),
];

const S = (id, name, original, date, genres, creators, cast, country, overview, score, votes, imdb, seasons) => ({
  id, name, original_name: original, first_air_date: date, genres: genres.map((n, i) => ({ id: i + 1, name: n })),
  created_by: creators.map((n, i) => ({ id: id * 10 + i, name: n })), credits: { cast: cast.map((n, i) => ({ id: id * 100 + i, name: n, character: null })), crew: [] },
  origin_country: country, production_countries: [], original_language: 'en', overview, vote_average: score, vote_count: votes,
  poster_path: `/sx${id}.jpg`, backdrop_path: null, popularity: 50, number_of_seasons: seasons.length, number_of_episodes: seasons.reduce((a, s) => a + s.episode_count, 0),
  seasons: seasons.map((s, i) => ({ season_number: i + 1, name: `Temporada ${i + 1}`, episode_count: s.episode_count, air_date: s.air_date })),
  episode_run_time: [48], external_ids: { imdb_id: imdb }, status: 'Ended', production_companies: [], homepage: '',
});

export const SHOWS = [
  S(910001, 'The Wire', 'The Wire', '2002-06-02', ['Crime', 'Drama'], ['David Simon'], ['Dominic West', 'Idris Elba'], ['US'], 'A polícia e o tráfico de Baltimore vistos por dentro de instituições inteiras.', 8.6, 2100, 'tt0306414',
    [{ episode_count: 13, air_date: '2002-06-02' }, { episode_count: 12, air_date: '2003-06-01' }, { episode_count: 12, air_date: '2004-09-19' }, { episode_count: 13, air_date: '2006-09-10' }, { episode_count: 10, air_date: '2008-01-06' }]),
  S(910002, 'Twin Peaks', 'Twin Peaks', '1990-04-08', ['Mistério', 'Drama'], ['David Lynch', 'Mark Frost'], ['Kyle MacLachlan', 'Sheryl Lee'], ['US'], 'Um agente do FBI investiga o assassinato de uma jovem numa cidadezinha do noroeste americano.', 8.4, 2000, 'tt0098936',
    [{ episode_count: 8, air_date: '1990-04-08' }, { episode_count: 22, air_date: '1990-09-30' }]),
];

// Uma série que só existe no TVmaze (para testar o complemento sem TMDB).
export const TVMAZE_ONLY = {
  id: 4242, name: 'Estação Fantasma', premiered: '1999-03-01', ended: '1999-12-01', status: 'Ended', language: 'Portuguese',
  genres: ['Drama', 'Mystery'], summary: '<p>Uma estação de rádio de <b>madrugada</b> recebe ligações estranhas.</p>',
  image: { medium: 'http://static.tvmaze.com/uploads/images/medium_portrait/0/1.jpg', original: 'http://static.tvmaze.com/uploads/images/original_untouched/0/1.jpg' },
  externals: { imdb: 'tt9990001' }, network: { name: 'Rede Exemplo', country: { code: 'BR' } }, rating: { average: 7.7 }, runtime: 30,
  officialSite: null, _embedded: { episodes: [{ season: 1, airdate: '1999-03-01' }, { season: 1, airdate: '1999-03-08' }], cast: [], crew: [{ type: 'Creator', person: { name: 'Ana Autora' } }] },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Cria um fetch falso. `calls` registra cada requisição para os testes conferirem cache e chaves. */
export function createMockFetch({ failTmdb = false } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ host: url.host, path: url.pathname, search: url.search, headers: init.headers ?? {} });
    const q = fold(url.searchParams.get('query') ?? url.searchParams.get('q') ?? url.searchParams.get('search') ?? '');

    if (url.host === 'api.themoviedb.org') {
      if (failTmdb) return json({ status_message: 'Invalid API key' }, 401);
      const p = url.pathname.replace('/3', '');
      const match = (list) => list.filter((x) => fold(`${x.title ?? x.name} ${x.original_title ?? x.original_name}`).includes(q));
      if (p === '/search/multi') return json({ results: [...match(MOVIES).map((m) => ({ ...m, media_type: 'movie' })), ...match(SHOWS).map((s) => ({ ...s, media_type: 'tv' }))] });
      if (p === '/search/movie') {
        const y = url.searchParams.get('year');
        return json({ results: match(MOVIES).filter((m) => !y || m.release_date.startsWith(y)) });
      }
      if (p === '/search/tv') return json({ results: match(SHOWS) });
      if (p === '/search/person') return json({ results: q.includes('lynch') ? [{ id: 777, name: 'David Lynch', known_for_department: 'Directing', profile_path: null, known_for: [{ name: 'Twin Peaks' }] }] : [] });
      const mv = p.match(/^\/movie\/(\d+)$/);
      if (mv) {
        const m = MOVIES.find((x) => x.id === Number(mv[1]));
        if (!m) return json({ status_message: 'not found' }, 404);
        return json({ ...m, external_ids: { imdb_id: m.imdb_id } });
      }
      const tv = p.match(/^\/tv\/(\d+)$/);
      if (tv) {
        const s = SHOWS.find((x) => x.id === Number(tv[1]));
        return s ? json(s) : json({}, 404);
      }
      const find = p.match(/^\/find\/(.+)$/);
      if (find) {
        const id = decodeURIComponent(find[1]);
        return json({ movie_results: MOVIES.filter((m) => m.imdb_id === id), tv_results: SHOWS.filter((s) => s.external_ids.imdb_id === id) });
      }
      if (p.match(/^\/person\/777\/combined_credits$/)) return json({ cast: [], crew: [{ ...SHOWS[1], media_type: 'tv' }] });
      return json({}, 404);
    }

    if (url.host === 'api.tvmaze.com') {
      if (url.pathname === '/search/shows') {
        const hits = [];
        if (q.includes('estacao')) hits.push({ score: 1, show: TVMAZE_ONLY });
        for (const s of SHOWS) if (fold(s.name).includes(q)) hits.push({ score: 0.8, show: { id: 5000 + s.id, name: s.name, premiered: s.first_air_date, summary: '', image: null, externals: { imdb: s.external_ids.imdb_id } } });
        return json(hits);
      }
      const show = url.pathname.match(/^\/shows\/(\d+)$/);
      if (show) {
        if (Number(show[1]) === 4242) return json(TVMAZE_ONLY);
        const base = SHOWS.find((s) => 5000 + s.id === Number(show[1]));
        if (base) return json({ id: 5000 + base.id, name: base.name, premiered: base.first_air_date, status: 'Ended', genres: base.genres.map((g) => g.name), summary: '', externals: { imdb: base.external_ids.imdb_id }, network: { name: 'HBO' }, rating: { average: 9 }, _embedded: { episodes: [{ season: 1, airdate: base.first_air_date }], cast: [], crew: [] } });
        return json({}, 404);
      }
      if (url.pathname === '/lookup/shows') {
        const imdb = url.searchParams.get('imdb');
        const base = SHOWS.find((s) => s.external_ids.imdb_id === imdb);
        if (base) return json({ id: 5000 + base.id, name: base.name, premiered: base.first_air_date, summary: '', image: null, externals: { imdb } });
        return json({}, 404);
      }
    }

    if (url.host === 'www.wikidata.org') return json({ search: [], entities: {} });
    if (url.host === 'query.wikidata.org') return json({ results: { bindings: [] } });
    return json({}, 404);
  };
  return { fetchImpl, calls };
}
