/* AENA - Carregamento do Firebase (SDK modular via CDN oficial) */
(function () {
  const VERSAO = '10.12.2';
  const BASE = `https://www.gstatic.com/firebasejs/${VERSAO}/`;
  // Usuários sem e-mail entram com "login"; internamente vira login@DOMINIO
  const DOMINIO = 'aena-novoacordo.local';
  let carregando = null;

  const FB = {
    enabled: !!(window.AENA_FIREBASE && window.AENA_FIREBASE.apiKey),
    DOMINIO,

    loginParaEmail(login) {
      login = String(login || '').trim().toLowerCase();
      return login.includes('@') ? login : `${login}@${DOMINIO}`;
    },
    emailReal(email) { return !!email && !String(email).endsWith('@' + DOMINIO); },

    load() {
      if (!FB.enabled) return Promise.reject(new Error('Firebase não configurado'));
      if (carregando) return carregando;
      carregando = (async () => {
        const [a, au, fs] = await Promise.all([
          import(BASE + 'firebase-app.js'),
          import(BASE + 'firebase-auth.js'),
          import(BASE + 'firebase-firestore.js')
        ]);
        const app = a.initializeApp(window.AENA_FIREBASE);
        let db;
        try {
          // Cache local persistente: funciona offline e sincroniza depois
          db = fs.initializeFirestore(app, {
            localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
          });
        } catch (e) {
          db = fs.getFirestore(app);
        }
        const auth = au.getAuth(app);
        // Uso em testes: window.AENA_EMULADOR = { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8080] }
        if (window.AENA_EMULADOR) {
          au.connectAuthEmulator(auth, window.AENA_EMULADOR.auth, { disableWarnings: true });
          fs.connectFirestoreEmulator(db, ...window.AENA_EMULADOR.firestore);
        }
        await au.setPersistence(auth, au.browserSessionPersistence);
        Object.assign(FB, { a, au, fs, app, db, auth });
        return FB;
      })();
      return carregando;
    },

    // App secundário: permite ao admin criar usuários sem sair da própria sessão
    async secundario() {
      await FB.load();
      if (!FB._sec) {
        const app2 = FB.a.initializeApp(window.AENA_FIREBASE, 'secundario');
        FB._sec = FB.au.getAuth(app2);
        if (window.AENA_EMULADOR) FB.au.connectAuthEmulator(FB._sec, window.AENA_EMULADOR.auth, { disableWarnings: true });
        await FB.au.setPersistence(FB._sec, FB.au.inMemoryPersistence);
      }
      return FB._sec;
    },

    traduzErro(e) {
      const c = (e && e.code) || '';
      const m = {
        'auth/invalid-credential': 'Usuário ou senha inválidos.',
        'auth/wrong-password': 'Usuário ou senha inválidos.',
        'auth/user-not-found': 'Usuário ou senha inválidos.',
        'auth/invalid-email': 'Usuário inválido.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
        'auth/email-already-in-use': 'Esse login já existe.',
        'auth/weak-password': 'Senha fraca (mínimo 6 caracteres).',
        'auth/network-request-failed': 'Sem conexão com a internet.',
        'auth/requires-recent-login': 'Por segurança, saia e entre novamente antes de trocar a senha.',
        'permission-denied': 'Sem permissão para esta operação.',
        'unavailable': 'Sem conexão. A operação será sincronizada quando a internet voltar.'
      };
      return m[c] || (e && e.message) || 'Erro desconhecido.';
    }
  };

  window.FB = FB;
})();
