/* AENA - Autenticação
 * Modo FIREBASE: Firebase Authentication + perfil em usuarios/{uid}; permissões validadas
 * pelas regras do Firestore (firestore.rules).
 * Modo LOCAL: hash SHA-256 com sal no navegador.
 */
(function () {
  const SESSION_KEY = 'aena_session';
  const SESSION_HORAS = 8;

  // SHA-256 em JS puro (usado quando crypto.subtle não está disponível, ex.: arquivo aberto localmente)
  function sha256Fallback(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const bitLen = ascii.length * 8;
    const hash = [], k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let c = 2; primeCounter < 64; c++) {
      if (!isComposite[c]) {
        for (let i = 0; i < 313; i += c) isComposite[i] = c;
        hash[primeCounter] = (Math.pow(c, .5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((bitLen / maxWord) | 0);
    words[words.length] = (bitLen);
    let h = hash.slice(0, 8);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = h;
      h = h.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = h[0], e = h[4];
        const temp1 = h[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & h[5]) ^ ((~e) & h[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(temp1 + temp2) | 0].concat(h);
        h[4] = (h[4] + temp1) | 0;
        h.length = 8;
      }
      for (let i = 0; i < 8; i++) h[i] = (h[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (h[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  async function sha256(text) {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // fallback: converte para UTF-8 em "bytes" ASCII
    return sha256Fallback(unescape(encodeURIComponent(text)));
  }

  function salt() {
    const a = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const Auth = {
    _sess: null,

    // Páginas permitidas por perfil
    ACESSO: {
      'painel.html':        ['admin', 'secretaria', 'nutricionista', 'diretor'],
      'nutricionista.html': ['admin', 'nutricionista'],
      'diretor.html':       ['admin', 'diretor'],
      'merendeira.html':    ['admin', 'merendeira', 'diretor'],
      'usuarios.html':      ['admin'],
      'legislacao.html':    ['admin', 'secretaria', 'nutricionista', 'diretor', 'merendeira']
    },

    online() { return !!(window.FB && FB.enabled); },

    paginaInicial(papel) {
      return { merendeira: 'merendeira.html', nutricionista: 'nutricionista.html', diretor: 'diretor.html' }[papel] || 'painel.html';
    },

    validaSenha(s) {
      if (!s || s.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
      if (!/[0-9]/.test(s) || !/[a-zA-Z]/.test(s)) return 'Use letras e números.';
      return '';
    },

    /* ============ Sessão ============ */

    // Aguarda o estado de login (Firebase) e carrega o perfil do usuário
    async ready() {
      if (!this.online()) { DB.load(); return this.session(); }
      await FB.load();
      const user = await new Promise(res => { const off = FB.au.onAuthStateChanged(FB.auth, u => { off(); res(u); }); });
      this._sess = user ? await this._perfil(user) : null;
      return this._sess;
    },

    async _perfil(user) {
      const { fs, db } = FB;
      const snap = await fs.getDoc(fs.doc(db, 'usuarios', user.uid));
      if (!snap.exists()) return null;
      const u = snap.data();
      return { userId: user.uid, login: u.login, nome: u.nome, papel: u.papel, escolaId: u.escolaId || '',
        ativo: u.ativo !== false, trocarSenha: !!u.trocarSenha, email: user.email };
    },

    session() {
      if (this.online()) return this._sess;
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
        if (s && s.exp > Date.now()) return s;
      } catch (e) { /* ignora */ }
      return null;
    },

    async login(login, senha) {
      if (this.online()) {
        try {
          await FB.load();
          const cred = await FB.au.signInWithEmailAndPassword(FB.auth, await this._emailDoLogin(login), senha);
          const s = await this._perfil(cred.user);
          if (!s || !s.ativo) { await FB.au.signOut(FB.auth); return { ok: false, msg: s ? 'Usuário desativado.' : 'Usuário sem perfil cadastrado. Procure o administrador.' }; }
          this._sess = s;
          FB.fs.updateDoc(FB.fs.doc(FB.db, 'usuarios', s.userId), { ultimoAcesso: new Date().toISOString() }).catch(() => {});
          return { ok: true, user: s, trocarSenha: s.trocarSenha };
        } catch (e) {
          return { ok: false, msg: FB.traduzErro(e) };
        }
      }
      return this._loginLocal(login, senha);
    },

    // Login -> e-mail interno da conta atual (muda quando o admin reseta a senha)
    async _emailDoLogin(login) {
      const l = String(login || '').trim().toLowerCase();
      if (l && !l.includes('/')) {
        try {
          const snap = await FB.fs.getDoc(FB.fs.doc(FB.db, 'logins', l));
          if (snap.exists() && snap.data().email) return snap.data().email;
        } catch (e) { /* sem vínculo: usa o padrão */ }
      }
      return FB.loginParaEmail(l);
    },

    _novoEmailInterno(login) {
      const slug = String(login).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
      return `${slug}.${Date.now().toString(36)}@${FB.DOMINIO}`;
    },

    async _criarConta(email, senha) {
      const sec = await FB.secundario();
      try {
        const cred = await FB.au.createUserWithEmailAndPassword(sec, email, senha);
        await FB.au.signOut(sec);
        return cred.user.uid;
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') throw new Error('Este e-mail já tem conta no Firebase. Use outro login, ou exclua a conta antiga em Console do Firebase > Authentication.');
        throw new Error(FB.traduzErro(e));
      }
    },

    async logout() {
      if (this.online() && FB.auth) await FB.au.signOut(FB.auth);
      sessionStorage.removeItem(SESSION_KEY);
      location.href = 'index.html';
    },

    // Protege a página atual. Retorna a sessão ou redireciona.
    async guard() {
      const pagina = location.pathname.split('/').pop() || 'index.html';
      const s = await this.ready();
      if (!s) { location.replace('index.html?volta=' + encodeURIComponent(pagina)); return null; }
      if (!this.online()) {
        const u = DB.get('usuarios', s.userId);
        if (!u || !u.ativo) { await this.logout(); return null; }
        s.trocarSenha = !!u.trocarSenha; s.escolaId = u.escolaId || '';
      }
      if (!s.ativo && this.online()) { await this.logout(); return null; }
      if (s.trocarSenha) { location.replace('index.html?trocar=1'); return null; }
      const permitidos = this.ACESSO[pagina];
      if (permitidos && !permitidos.includes(s.papel)) { location.replace(this.paginaInicial(s.papel)); return null; }
      return s;
    },

    /* ============ Senhas ============ */

    // Troca obrigatória no primeiro acesso (usuário acabou de digitar a senha)
    async trocarSenhaInicial(nova) {
      const s = this.session();
      if (this.online()) {
        await FB.au.updatePassword(FB.auth.currentUser, nova);
        await FB.fs.updateDoc(FB.fs.doc(FB.db, 'usuarios', s.userId), { trocarSenha: false });
        s.trocarSenha = false;
        return;
      }
      await this.setSenha(s.userId, nova);
    },

    async alterarSenha(atual, nova) {
      const s = this.session();
      if (this.online()) {
        const user = FB.auth.currentUser;
        try {
          await FB.au.reauthenticateWithCredential(user, FB.au.EmailAuthProvider.credential(user.email, atual));
        } catch (e) { throw new Error('Senha atual incorreta.'); }
        await FB.au.updatePassword(user, nova);
        return;
      }
      if (!(await this.conferirSenha(s.userId, atual))) throw new Error('Senha atual incorreta.');
      await this.setSenha(s.userId, nova);
    },

    /* ============ Administração de usuários ============ */

    // Cria usuário (admin). No Firebase cria o login no Authentication e o perfil no Firestore.
    async criarUsuario(dados, senha) {
      if (this.online()) {
        const login = dados.login.toLowerCase();
        const existe = await FB.fs.getDoc(FB.fs.doc(FB.db, 'logins', login));
        if (existe.exists()) throw new Error('Esse login já existe.');
        // E-mail real: conta com o próprio e-mail. Sem e-mail: endereço interno.
        const email = login.includes('@') ? login : this._novoEmailInterno(login);
        const uidNovo = await this._criarConta(email, senha);
        await FB.fs.setDoc(FB.fs.doc(FB.db, 'logins', login), { email, uid: uidNovo });
        return DB.insert('usuarios', Object.assign({}, dados, { login, id: uidNovo, trocarSenha: true }));
      }
      const u = DB.insert('usuarios', Object.assign({}, dados));
      await this.setSenha(u.id, senha);
      DB.update('usuarios', u.id, { trocarSenha: true });
      return u;
    },

    // Reset de senha pelo admin: define senha temporária; o usuário troca no próximo acesso.
    // Firebase: o navegador não pode alterar a senha de outra conta, então cria-se uma conta nova
    // para o mesmo login, o perfil é transferido e a conta antiga fica sem acesso.
    async redefinirSenha(userId, nova) {
      const u = DB.get('usuarios', userId);
      if (!u) throw new Error('Usuário não encontrado.');
      if (userId === this.session().userId) throw new Error('Para a sua própria senha, use "Alterar senha" no topo da página.');
      if (this.online()) {
        const login = u.login.toLowerCase();
        const email = this._novoEmailInterno(login);
        const uidNovo = await this._criarConta(email, nova);
        const perfil = JSON.parse(JSON.stringify(u));
        delete perfil.id;
        DB.insert('usuarios', Object.assign(perfil, { id: uidNovo, trocarSenha: true, senhaResetadaEm: new Date().toISOString() }));
        await FB.fs.setDoc(FB.fs.doc(FB.db, 'logins', login), { email, uid: uidNovo });
        DB.remove('usuarios', userId);
        return uidNovo;
      }
      await this.setSenha(userId, nova);
      DB.update('usuarios', userId, { trocarSenha: true, senhaResetadaEm: new Date().toISOString() });
      return userId;
    },

    // Remove o usuário. Firebase: apaga perfil e vínculo do login (a conta antiga fica sem acesso).
    async removerUsuario(userId) {
      const u = DB.get('usuarios', userId);
      if (!u) return;
      if (userId === this.session().userId) throw new Error('Você não pode remover o seu próprio usuário.');
      if (u.papel === 'admin' && DB.list('usuarios').filter(x => x.papel === 'admin' && x.ativo !== false).length <= 1)
        throw new Error('Não é possível remover o último administrador.');
      DB.remove('usuarios', userId);
      if (this.online()) await FB.fs.deleteDoc(FB.fs.doc(FB.db, 'logins', u.login.toLowerCase())).catch(() => {});
    },

    gerarSenhaTemporaria() {
      const letras = 'abcdefghjkmnpqrstuvwxyz', nums = '23456789';
      const r = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
      let s = 'Aena';
      for (let i = 0; i < 2; i++) s += letras[r(letras.length)];
      for (let i = 0; i < 4; i++) s += nums[r(nums.length)];
      return s;
    },

    /* ============ Primeira configuração (Firebase) ============ */
    async precisaSetup() {
      if (!this.online()) return false;
      await FB.load();
      const snap = await FB.fs.getDoc(FB.fs.doc(FB.db, 'config', 'bootstrap'));
      return !snap.exists();
    },

    async setupAdmin(nome, login, senha, semear) {
      await FB.load();
      const { fs, db, au, auth } = FB;
      let cred;
      try { cred = await au.createUserWithEmailAndPassword(auth, FB.loginParaEmail(login), senha); }
      catch (e) {
        if (e.code === 'auth/email-already-in-use') cred = await au.signInWithEmailAndPassword(auth, FB.loginParaEmail(login), senha);
        else throw new Error(FB.traduzErro(e));
      }
      const uidAdm = cred.user.uid;
      const b = fs.writeBatch(db);
      b.set(fs.doc(db, 'usuarios', uidAdm), { login: login.toLowerCase(), nome, papel: 'admin', escolaId: '', ativo: true,
        trocarSenha: false, criadoEm: new Date().toISOString() });
      b.set(fs.doc(db, 'config', 'bootstrap'), { em: new Date().toISOString(), por: uidAdm });
      await b.commit();
      this._sess = await this._perfil(cred.user);
      if (semear) await DB.semearFirebase();
    },

    /* ============ Modo local ============ */
    async hash(senha, s) { return sha256(s + ':' + senha); },

    async garantirUsuarios() {
      if (this.online()) return;
      const d = DB.load();
      if (d.usuarios.length) return;
      const padrao = [
        ['admin', 'Administrador do Sistema', 'admin'],
        ['secretaria', 'Secretaria Municipal de Educação', 'secretaria'],
        ['nutricionista', 'Nutricionista Responsável Técnica', 'nutricionista'],
        ['diretor', 'Diretor de Alimentação Escolar', 'diretor'],
        ['merendeira', 'Merendeira (exemplo)', 'merendeira']
      ];
      for (const [login, nome, papel] of padrao) {
        const s = salt();
        d.usuarios.push({
          id: DB.uid(), login, nome, papel, sal: s, senha: await this.hash('aena2026', s),
          trocarSenha: true, ativo: true,
          escolaId: papel === 'merendeira' && d.escolas[0] ? d.escolas[0].id : ''
        });
      }
      DB.save();
    },

    async _loginLocal(login, senha) {
      await this.garantirUsuarios();
      const u = DB.list('usuarios').find(x => x.login.toLowerCase() === String(login).trim().toLowerCase());
      if (!u || !u.ativo) return { ok: false, msg: 'Usuário ou senha inválidos.' };
      if (u.bloqueadoAte && Date.now() < u.bloqueadoAte) return { ok: false, msg: 'Muitas tentativas. Tente novamente em alguns minutos.' };
      const h = await this.hash(senha, u.sal);
      if (h !== u.senha) {
        u.falhas = (u.falhas || 0) + 1;
        if (u.falhas >= 5) { u.bloqueadoAte = Date.now() + 5 * 60 * 1000; u.falhas = 0; }
        DB.save();
        return { ok: false, msg: 'Usuário ou senha inválidos.' };
      }
      u.falhas = 0; u.bloqueadoAte = 0; u.ultimoAcesso = new Date().toISOString();
      DB.save();
      const sess = { userId: u.id, login: u.login, nome: u.nome, papel: u.papel, escolaId: u.escolaId || '', ativo: true,
        trocarSenha: !!u.trocarSenha, exp: Date.now() + SESSION_HORAS * 3600 * 1000 };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      return { ok: true, user: u, trocarSenha: !!u.trocarSenha };
    },

    async setSenha(userId, nova) {
      const u = DB.get('usuarios', userId);
      if (!u) return;
      u.sal = salt();
      u.senha = await this.hash(nova, u.sal);
      u.trocarSenha = false;
      DB.save();
    },

    async conferirSenha(userId, senha) {
      const u = DB.get('usuarios', userId);
      return !!u && (await this.hash(senha, u.sal)) === u.senha;
    }
  };

  window.Auth = Auth;
})();
