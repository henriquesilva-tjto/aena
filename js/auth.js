/* AENA - Autenticação
 * Senhas guardadas como hash SHA-256 com "sal" individual. Sessão expira em 8 horas.
 * ATENÇÃO: em site estático (GitHub Pages) o login protege o uso cotidiano,
 * mas não substitui autenticação em servidor. Ver README.
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
    // Páginas permitidas por perfil
    ACESSO: {
      'painel.html':        ['admin', 'secretaria', 'nutricionista', 'diretor'],
      'nutricionista.html': ['admin', 'nutricionista'],
      'diretor.html':       ['admin', 'diretor'],
      'merendeira.html':    ['admin', 'merendeira', 'diretor'],
      'usuarios.html':      ['admin'],
      'legislacao.html':    ['admin', 'secretaria', 'nutricionista', 'diretor', 'merendeira']
    },

    paginaInicial(papel) {
      return { merendeira: 'merendeira.html', nutricionista: 'nutricionista.html', diretor: 'diretor.html' }[papel] || 'painel.html';
    },

    async hash(senha, s) { return sha256(s + ':' + senha); },

    // Cria usuários padrão na primeira execução
    async garantirUsuarios() {
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

    async login(login, senha) {
      await this.garantirUsuarios();
      const u = DB.list('usuarios').find(x => x.login.toLowerCase() === String(login).trim().toLowerCase());
      if (!u || !u.ativo) return { ok: false, msg: 'Usuário ou senha inválidos.' };
      if (u.bloqueadoAte && Date.now() < u.bloqueadoAte) {
        return { ok: false, msg: 'Muitas tentativas. Tente novamente em alguns minutos.' };
      }
      const h = await this.hash(senha, u.sal);
      if (h !== u.senha) {
        u.falhas = (u.falhas || 0) + 1;
        if (u.falhas >= 5) { u.bloqueadoAte = Date.now() + 5 * 60 * 1000; u.falhas = 0; }
        DB.save();
        return { ok: false, msg: 'Usuário ou senha inválidos.' };
      }
      u.falhas = 0; u.bloqueadoAte = 0; u.ultimoAcesso = new Date().toISOString();
      DB.save();
      const sess = { userId: u.id, login: u.login, nome: u.nome, papel: u.papel, escolaId: u.escolaId || '',
        exp: Date.now() + SESSION_HORAS * 3600 * 1000 };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      return { ok: true, user: u, trocarSenha: !!u.trocarSenha };
    },

    session() {
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
        if (s && s.exp > Date.now()) return s;
      } catch (e) { /* ignora */ }
      return null;
    },

    logout() {
      sessionStorage.removeItem(SESSION_KEY);
      location.href = 'index.html';
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
    },

    validaSenha(s) {
      if (!s || s.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
      if (!/[0-9]/.test(s) || !/[a-zA-Z]/.test(s)) return 'Use letras e números.';
      return '';
    },

    // Protege a página atual. Retorna a sessão ou redireciona para o login.
    guard() {
      const pagina = location.pathname.split('/').pop() || 'index.html';
      const s = this.session();
      if (!s) { location.replace('index.html?volta=' + encodeURIComponent(pagina)); return null; }
      const u = DB.get('usuarios', s.userId);
      if (!u || !u.ativo) { this.logout(); return null; }
      if (u.trocarSenha) { location.replace('index.html?trocar=1'); return null; }
      const permitidos = this.ACESSO[pagina];
      if (permitidos && !permitidos.includes(s.papel)) {
        location.replace(this.paginaInicial(s.papel));
        return null;
      }
      s.escolaId = u.escolaId || '';
      return s;
    }
  };

  window.Auth = Auth;
})();
