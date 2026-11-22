// O TMDB entrega gêneros em português. TVmaze e Wikidata chegam em inglês (ou como "drama film").
// Normalizamos só os gêneros dessas fontes para que filtros e estatísticas agrupem corretamente.
const RULES = [
  [/anime/i, 'Anime'],
  [/sci-?fi|science.?fiction|ficção científica/i, 'Ficção científica'],
  [/documentar|documentário/i, 'Documentário'],
  [/animat|animaç|animad/i, 'Animação'],
  [/horror|terror/i, 'Terror'],
  [/thriller|suspense/i, 'Suspense'],
  [/comedy|comédia|comedia/i, 'Comédia'],
  [/romanc|romantic/i, 'Romance'],
  [/adventure|aventura/i, 'Aventura'],
  [/action|ação|acao/i, 'Ação'],
  [/fantasy|fantasia/i, 'Fantasia'],
  [/mystery|mistério|misterio/i, 'Mistério'],
  [/crime|noir|policial/i, 'Crime'],
  [/western|faroeste/i, 'Faroeste'],
  [/war|guerra/i, 'Guerra'],
  [/music|música|musical/i, 'Música'],
  [/famil/i, 'Família'],
  [/histor/i, 'História'],
  [/drama/i, 'Drama'],
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function canonicalGenre(label) {
  const s = String(label ?? '').trim();
  if (!s) return null;
  for (const [re, name] of RULES) if (re.test(s)) return name;
  return cap(s);
}

export function canonicalGenres(labels) {
  const out = [];
  for (const l of labels ?? []) {
    const g = canonicalGenre(l);
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}
