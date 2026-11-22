// tape-club — ponto de entrada. O corredor (cena 3D) é montado primeiro: ele é o cenário de todas as telas.
import { mountScene } from './lib/scene.js';
import { loadSession } from './lib/store.js';
import { route, startRouter } from './lib/router.js';
import { mountLayout } from './ui/layout.js';
import { initFicha } from './flows/ficha.js';
import { errorPage } from './ui/empty.js';

mountScene(document.getElementById('hall'));

route('/entrar', () => import('./pages/entrar.js'), { public: true, nav: null });
route('/', () => import('./pages/home.js'), { nav: 'inicio' });
route('/catalogo', () => import('./pages/catalogo.js'), { nav: 'catalogo' });
route('/minhas-fitas', () => import('./pages/minhas-fitas.js'), { nav: 'minhas-fitas' });
route('/avaliacoes', () => import('./pages/avaliacoes.js'), { nav: 'avaliacoes' });
route('/estatisticas', () => import('./pages/estatisticas.js'), { nav: 'estatisticas' });
route('/bot', () => import('./pages/bot.js'), { nav: 'bot' });
route('/sobre', () => import('./pages/sobre.js'), { nav: 'sobre' });
route('/creditos', () => import('./pages/sobre.js'), { nav: 'sobre' });

const app = document.getElementById('app');
try {
  await loadSession();
} catch (err) {
  app.append(errorPage(err, () => location.reload()));
  throw err;
}
const main = mountLayout(app);
initFicha();
startRouter(main);
