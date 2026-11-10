/* AENA - Alimentação Escolar Novo Acordo
 * Camada de dados. Dois modos:
 *  - LOCAL: tudo no navegador (localStorage) — usado quando o Firebase não está configurado.
 *  - FIREBASE: Firestore na nuvem, compartilhado entre todos os computadores.
 * As páginas usam sempre a mesma API (DB.list/get/insert/update/remove).
 * Os dados ficam em memória após DB.init(); as gravações vão para o Firestore
 * em segundo plano (com fila offline).
 */
(function () {
  const KEY = 'aena_db_v1';

  // Valores per capita PNAE 2026 (R$/aluno/dia letivo) - Resolução CD/FNDE nº 1/2026.
  // Conferir sempre o texto oficial antes de usar em prestação de contas.
  const MODALIDADES = {
    creche:      { nome: 'Creche',                         perCapita: 1.57 },
    pre:         { nome: 'Pré-escola',                     perCapita: 0.82 },
    fundamental: { nome: 'Ensino Fundamental',             perCapita: 0.57 },
    medio:       { nome: 'Ensino Médio',                   perCapita: 0.57 },
    eja:         { nome: 'EJA',                            perCapita: 0.57 },
    integral:    { nome: 'Tempo Integral (mín. 7h/dia)',   perCapita: 1.57 },
    indigena:    { nome: 'Indígena / Quilombola',          perCapita: 0.98 },
    aee:         { nome: 'AEE (contraturno)',              perCapita: 0.78 }
  };

  // Classificação NOVA (Guia Alimentar) usada pelo PNAE nos limites de compra.
  const CLASSES = {
    innatura:     'In natura / minimamente processado',
    culinario:    'Ingrediente culinário processado',
    processado:   'Processado',
    ultra:        'Ultraprocessado'
  };

  const GRUPOS = {
    cereal: 'Cereais, pães e massas',
    tuberculo: 'Raízes e tubérculos',
    leguminosa: 'Leguminosas (feijões)',
    fruta: 'Frutas',
    hortalica: 'Legumes e verduras',
    carne: 'Carnes e ovos',
    leite: 'Leite e derivados',
    oleo: 'Óleos e gorduras',
    acucar: 'Açúcares',
    tempero: 'Sal e temperos',
    outro: 'Outros'
  };

  const PAPEIS = {
    admin: 'Administrador',
    secretaria: 'Secretaria de Educação',
    nutricionista: 'Nutricionista (RT)',
    diretor: 'Diretor de Alimentação Escolar',
    merendeira: 'Merendeira'
  };

  const DEFAULT_CONFIG = {
    municipio: 'Novo Acordo - TO',
    entidade: 'Secretaria Municipal de Educação',
    metaAgriculturaFamiliar: 45,   // % mínimo dos recursos FNDE (Lei 15.226/2025)
    limiteProcUltra: 10,           // % máximo processados + ultraprocessados (Res. CD/FNDE 4/2026)
    limiteCulinario: 5,            // % máximo ingredientes culinários processados
    minInNatura: 85,               // % mínimo in natura / minimamente processados
    diasLetivos: 200,
    alertaValidadeDias: 30
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function seed() {
    const e1 = uid(), e2 = uid();
    const p = (nome, unidade, classe, grupo, nut, extra) => Object.assign({
      id: uid(), nome, unidade, classe, grupo, estoqueMin: 0, pesoUnidadeG: 0,
      kcal: nut[0], ptn: nut[1], cho: nut[2], lip: nut[3], fibra: nut[4], sodio: nut[5], ativo: true
    }, extra || {});
    // Valores nutricionais aproximados por 100 g (base TACO) - a nutricionista deve revisar.
    const produtos = [
      p('Arroz branco tipo 1', 'kg', 'innatura', 'cereal', [358, 7.2, 78.8, 0.3, 1.6, 1], { estoqueMin: 50 }),
      p('Feijão carioca', 'kg', 'innatura', 'leguminosa', [329, 20, 61.2, 1.3, 18.4, 2], { estoqueMin: 30 }),
      p('Carne bovina (acém) congelada', 'kg', 'innatura', 'carne', [215, 26.7, 0, 11.2, 0, 61], { estoqueMin: 20 }),
      p('Frango (coxa/sobrecoxa)', 'kg', 'innatura', 'carne', [161, 17.1, 0, 9.8, 0, 98], { estoqueMin: 20 }),
      p('Ovo de galinha', 'un', 'innatura', 'carne', [143, 13, 1.6, 8.9, 0, 168], { pesoUnidadeG: 50, estoqueMin: 120 }),
      p('Mandioca', 'kg', 'innatura', 'tuberculo', [125, 0.6, 30.1, 0.3, 1.6, 2], { estoqueMin: 10 }),
      p('Banana prata', 'kg', 'innatura', 'fruta', [98, 1.3, 26, 0.1, 2, 0], { estoqueMin: 10 }),
      p('Melancia', 'kg', 'innatura', 'fruta', [33, 0.9, 8.1, 0, 0.1, 0]),
      p('Abóbora cabotiá', 'kg', 'innatura', 'hortalica', [48, 1.4, 10.8, 0.7, 2.2, 0]),
      p('Cenoura', 'kg', 'innatura', 'hortalica', [34, 1.3, 7.7, 0.2, 3.2, 3]),
      p('Alface', 'kg', 'innatura', 'hortalica', [11, 1.3, 1.7, 0.2, 1.8, 3]),
      p('Leite em pó integral', 'kg', 'innatura', 'leite', [497, 25.4, 39.2, 26.9, 0, 323]),
      p('Óleo de soja', 'L', 'culinario', 'oleo', [884, 0, 0, 100, 0, 0]),
      p('Sal refinado iodado', 'kg', 'culinario', 'tempero', [0, 0, 0, 0, 0, 39263]),
      p('Açúcar cristal', 'kg', 'culinario', 'acucar', [387, 0.3, 99.6, 0, 0, 0]),
      p('Macarrão espaguete', 'kg', 'processado', 'cereal', [371, 10, 77.9, 1.3, 2.9, 7]),
      p('Pão francês', 'kg', 'processado', 'cereal', [300, 8, 58.6, 3.1, 2.3, 648])
    ];
    return {
      versao: 2,
      config: Object.assign({}, DEFAULT_CONFIG),
      usuarios: [],
      escolas: [
        { id: e1, nome: 'Escola Municipal (exemplo 1)', alunos: { fundamental: 150, pre: 40 }, ativo: true },
        { id: e2, nome: 'Creche Municipal (exemplo 2)', alunos: { creche: 60 }, ativo: true }
      ],
      fornecedores: [],
      produtos,
      entradas: [],
      saidas: [],
      refeicoes: [],
      preparacoes: [],
      cardapios: [],
      repasses: [],
      estoque: {},
      log: []
    };
  }


  const COLS = ['usuarios', 'escolas', 'fornecedores', 'produtos', 'entradas', 'saidas',
    'refeicoes', 'preparacoes', 'cardapios', 'repasses'];

  // Contribuição de um documento para o resumo de estoque {produtoId: {qtdEnt, valorEnt, qtdSai}}
  function efeito(col, o) {
    const r = {};
    const add = (pid, k, v) => { if (!pid || !v) return; r[pid] = r[pid] || { qtdEnt: 0, valorEnt: 0, qtdSai: 0 }; r[pid][k] += v; };
    if (!o) return r;
    if (col === 'entradas') { const q = +o.quantidade || 0; add(o.produtoId, 'qtdEnt', q); add(o.produtoId, 'valorEnt', q * (+o.valorUnit || 0)); }
    if (col === 'saidas') add(o.produtoId, 'qtdSai', +o.quantidade || 0);
    if (col === 'refeicoes') (o.itens || []).forEach(i => add(i.produtoId, 'qtdSai', +i.quantidade || 0));
    return r;
  }
  function combina(a, b, sinalB) {
    const r = JSON.parse(JSON.stringify(a));
    Object.entries(b).forEach(([pid, v]) => {
      r[pid] = r[pid] || { qtdEnt: 0, valorEnt: 0, qtdSai: 0 };
      Object.keys(v).forEach(k => r[pid][k] += sinalB * v[k]);
    });
    return r;
  }
  const limpo = o => JSON.parse(JSON.stringify(o));
  const arred = v => Math.round(v * 1e6) / 1e6;

  const DB = {
    MODALIDADES, CLASSES, GRUPOS, PAPEIS, DEFAULT_CONFIG, COLS,
    data: null,
    modo: 'local',
    uid,

    /* ================= Inicialização ================= */

    // opts.cols: coleções a carregar (modo Firebase). opts.periodo: {col: [ini, fim]} carrega só o intervalo.
    async init(opts) {
      opts = opts || {};
      if (window.FB && FB.enabled) {
        this.modo = 'firebase';
        await this._initFirebase(opts);
      } else {
        this.modo = 'local';
        this.load();
      }
      this._aplicaPerCapita();
      return this.data;
    },

    load() {
      if (this.data) return this.data;
      try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.data = null; }
      if (!this.data) { this.data = seed(); this.save(); }
      const base = seed();
      Object.keys(base).forEach(k => { if (this.data[k] === undefined) this.data[k] = k === 'estoque' ? {} : base[k]; });
      this.data.config = Object.assign({}, DEFAULT_CONFIG, this.data.config);
      this._migraLocal();
      this._aplicaPerCapita();
      return this.data;
    },

    _aplicaPerCapita() {
      Object.entries((this.data.config || {}).perCapita || {}).forEach(([k, v]) => {
        if (MODALIDADES[k] && +v > 0) MODALIDADES[k].perCapita = +v;
      });
    },

    // Versão 1 -> 2: saídas de consumo passam a ficar dentro do registro de refeição; cria resumo de estoque
    _migraLocal() {
      const d = this.data;
      if ((d.versao || 1) >= 2) return;
      const consumo = d.saidas.filter(s => s.refeicaoId);
      consumo.forEach(s => {
        const r = d.refeicoes.find(x => x.id === s.refeicaoId);
        if (r) { r.itens = r.itens || []; r.itens.push({ produtoId: s.produtoId, quantidade: +s.quantidade }); }
      });
      d.saidas = d.saidas.filter(s => !s.refeicaoId);
      this.recalculaEstoque();
      d.versao = 2;
      this.save();
    },

    // Recalcula o resumo de estoque a partir do histórico em memória
    recalculaEstoque() {
      let r = {};
      ['entradas', 'saidas', 'refeicoes'].forEach(col => this.data[col].forEach(o => { r = combina(r, efeito(col, o), 1); }));
      this.data.estoque = r;
      return r;
    },

    async _initFirebase(opts) {
      await FB.load();
      const { fs, db } = FB;
      const d = seed();
      COLS.forEach(c => d[c] = []);
      d.estoque = {}; d.log = [];
      this.data = d;
      const cfg = await fs.getDoc(fs.doc(db, 'config', 'geral')).catch(() => null);
      d.config = Object.assign({}, DEFAULT_CONFIG, cfg && cfg.exists() ? cfg.data() : {});
      const tarefas = [];
      const periodo = opts.periodo || {};
      const cols = [...new Set([...(opts.cols || []), ...Object.keys(periodo)])];
      cols.forEach(c => tarefas.push(this.fetch(c, periodo[c])));
      if (opts.estoque !== false) {
        tarefas.push(fs.getDocs(fs.collection(db, 'estoque')).then(snap => {
          snap.forEach(x => { d.estoque[x.id] = Object.assign({ qtdEnt: 0, valorEnt: 0, qtdSai: 0 }, x.data()); });
        }));
      }
      await Promise.all(tarefas);
    },

    // Carrega (ou recarrega) uma coleção; com intervalo [ini, fim] filtra pelo campo "data"
    async fetch(col, intervalo) {
      if (this.modo !== 'firebase') return this.list(col);
      const { fs, db } = FB;
      let q = fs.collection(db, col);
      if (intervalo && intervalo[0]) q = fs.query(q, fs.where('data', '>=', intervalo[0]), fs.where('data', '<=', intervalo[1] || '9999-12-31'));
      const snap = await fs.getDocs(q);
      const arr = [];
      snap.forEach(x => arr.push(Object.assign({}, x.data(), { id: x.id })));
      this.data[col] = arr;
      return arr;
    },

    async fetchLog(n) {
      if (this.modo !== 'firebase') return this.list('log').slice(-n).reverse();
      const { fs, db } = FB;
      const snap = await fs.getDocs(fs.query(fs.collection(db, 'log'), fs.orderBy('em', 'desc'), fs.limit(n)));
      const arr = []; snap.forEach(x => arr.push(x.data()));
      return arr;
    },

    save() {
      if (this.modo === 'local') localStorage.setItem(KEY, JSON.stringify(this.data));
    },

    async saveConfig(patch) {
      Object.assign(this.data.config, patch);
      this._aplicaPerCapita();
      if (this.modo === 'firebase') {
        const { fs, db } = FB;
        await fs.setDoc(fs.doc(db, 'config', 'geral'), limpo(this.data.config));
      }
      this.logAction('alterou', 'config', 'geral');
      this.save();
    },

    /* ================= Leitura ================= */
    list(col) { return (this.data && this.data[col]) || []; },
    get(col, id) { return this.list(col).find(x => x.id === id); },

    /* ================= Gravação ================= */
    _sess() { return window.Auth && Auth.session(); },

    insert(col, obj) {
      obj.id = obj.id || uid();
      obj.criadoEm = obj.criadoEm || new Date().toISOString();
      const s = this._sess();
      if (s) { obj.criadoPor = obj.criadoPor || s.login; obj.criadoPorUid = obj.criadoPorUid || s.userId; }
      this.data[col].push(obj);
      this._persist(col, obj, efeito(col, obj), 'inseriu');
      return obj;
    },

    update(col, id, patch) {
      const o = this.get(col, id);
      if (!o) return null;
      const antes = efeito(col, o);
      Object.assign(o, patch, { alteradoEm: new Date().toISOString() });
      delete o.id; o.id = id;
      this._persist(col, o, combina(efeito(col, o), antes, -1), 'alterou');
      return o;
    },

    remove(col, id) {
      const o = this.get(col, id);
      if (!o) return;
      this.data[col] = this.data[col].filter(x => x.id !== id);
      this._persist(col, null, combina({}, efeito(col, o), -1), 'excluiu', id);
    },

    // Aplica o delta de estoque em memória e grava (localStorage ou lote atômico no Firestore)
    _persist(col, obj, delta, acao, idRemovido) {
      const est = this.data.estoque;
      Object.entries(delta).forEach(([pid, v]) => {
        est[pid] = est[pid] || { qtdEnt: 0, valorEnt: 0, qtdSai: 0 };
        Object.keys(v).forEach(k => est[pid][k] = arred(est[pid][k] + v[k]));
      });
      const id = obj ? obj.id : idRemovido;
      if (this.modo === 'local') {
        this.logAction(acao, col, id);
        this.save();
        return;
      }
      const { fs, db } = FB;
      const b = fs.writeBatch(db);
      const ref = fs.doc(db, col, id);
      if (obj) { const dados = limpo(obj); delete dados.id; b.set(ref, dados); } else b.delete(ref);
      Object.entries(delta).forEach(([pid, v]) => {
        const inc = {};
        Object.keys(v).forEach(k => { if (v[k]) inc[k] = fs.increment(arred(v[k])); });
        if (Object.keys(inc).length) b.set(fs.doc(db, 'estoque', pid), inc, { merge: true });
      });
      const s = this._sess();
      b.set(fs.doc(fs.collection(db, 'log')), { em: new Date().toISOString(), por: s ? s.login : '-', acao, col, id });
      b.commit().catch(e => {
        console.error('Falha ao gravar', col, e);
        const msg = 'Erro ao salvar no servidor: ' + FB.traduzErro(e) + ' Recarregue a página.';
        if (window.UI) UI.toast(msg, 8000); else alert(msg);
      });
    },

    logAction(acao, col, id) {
      if (this.modo !== 'local') return; // no Firebase o log vai no mesmo lote da gravação
      const s = this._sess();
      const d = this.data;
      d.log.push({ em: new Date().toISOString(), por: s ? s.login : '-', acao, col, id });
      if (d.log.length > 2000) d.log = d.log.slice(-2000);
    },

    /* ================= Backup ================= */
    async exportJSON() {
      if (this.modo === 'firebase') {
        for (const c of COLS) await this.fetch(c);
      }
      const d = limpo(this.data);
      if (this.modo === 'firebase') d.usuarios = d.usuarios.map(u => ({ id: u.id, login: u.login, nome: u.nome, papel: u.papel, escolaId: u.escolaId, ativo: u.ativo }));
      return JSON.stringify(d, null, 2);
    },

    // Local: substitui tudo. Firebase: grava os cadastros e movimentos (não cria logins) e recalcula o estoque.
    async importJSON(txt, progresso) {
      const obj = JSON.parse(txt);
      if (!obj || !Array.isArray(obj.produtos)) throw new Error('Arquivo inválido');
      if (this.modo === 'local') {
        if (!Array.isArray(obj.usuarios) || !obj.usuarios.length) throw new Error('Backup sem usuários');
        const base = seed();
        Object.keys(base).forEach(k => { if (obj[k] === undefined) obj[k] = k === 'estoque' ? {} : base[k]; });
        obj.config = Object.assign({}, DEFAULT_CONFIG, obj.config);
        obj.versao = obj.versao || 1;
        // Backup do modo online não tem senhas: mantém os usuários locais atuais
        if (obj.usuarios.some(u => !u.senha)) obj.usuarios = this.load().usuarios;
        this.data = obj;
        this._migraLocal();
        this.recalculaEstoque();
        this.save();
        return;
      }
      // Normaliza versão antiga
      const tmp = Object.assign(seed(), obj);
      const salvo = this.data; this.data = tmp; this.modo = 'local-tmp';
      this._migraLocal(); this.recalculaEstoque();
      this.data = salvo; this.modo = 'firebase';
      const { fs, db } = FB;
      const ops = [];
      COLS.filter(c => c !== 'usuarios').forEach(c => (tmp[c] || []).forEach(o => { const x = limpo(o); const id = x.id; delete x.id; ops.push([fs.doc(db, c, id), x]); }));
      Object.entries(tmp.estoque).forEach(([pid, v]) => ops.push([fs.doc(db, 'estoque', pid), v]));
      ops.push([fs.doc(db, 'config', 'geral'), Object.assign({}, DEFAULT_CONFIG, tmp.config)]);
      for (let i = 0; i < ops.length; i += 400) {
        const b = fs.writeBatch(db);
        ops.slice(i, i + 400).forEach(([ref, x]) => b.set(ref, x));
        await b.commit();
        if (progresso) progresso(Math.min(ops.length, i + 400), ops.length);
      }
    },

    // Dados iniciais (produtos e escolas de exemplo) para um projeto Firebase novo
    async semearFirebase() {
      const { fs, db } = FB;
      const base = seed();
      const b = fs.writeBatch(db);
      ['produtos', 'escolas'].forEach(c => base[c].forEach(o => { const x = limpo(o); const id = x.id; delete x.id; b.set(fs.doc(db, c, id), x); }));
      b.set(fs.doc(db, 'config', 'geral'), limpo(base.config));
      await b.commit();
    },

    /* ================= Estoque ================= */
    _resumo(pid) { return (this.data.estoque || {})[pid] || { qtdEnt: 0, valorEnt: 0, qtdSai: 0 }; },
    estoque(produtoId) { const r = this._resumo(produtoId); return Math.round(((+r.qtdEnt || 0) - (+r.qtdSai || 0)) * 1000) / 1000; },
    precoMedio(produtoId) { const r = this._resumo(produtoId); return r.qtdEnt > 0 ? r.valorEnt / r.qtdEnt : 0; },

    // Lotes com saldo (para alerta de validade). Considera que as saídas consomem primeiro
    // as entradas não carregadas (mais antigas) e depois as de validade mais próxima.
    lotesComSaldo(produtoId) {
      const r = this._resumo(produtoId);
      const entradas = this.list('entradas').filter(e => e.produtoId === produtoId)
        .sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999'));
      const carregado = entradas.reduce((t, e) => t + (+e.quantidade || 0), 0);
      const antigas = Math.max(0, (+r.qtdEnt || 0) - carregado);
      let saida = Math.max(0, (+r.qtdSai || 0) - antigas);
      const res = [];
      entradas.forEach(e => {
        const consumido = Math.min(saida, +e.quantidade || 0);
        saida -= consumido;
        const saldo = (+e.quantidade || 0) - consumido;
        if (saldo > 0.0001) res.push({ entrada: e, saldo });
      });
      return res;
    },

    gramasParaUnidade(produto, gramas) {
      if (!produto) return 0;
      if (produto.unidade === 'un') return produto.pesoUnidadeG > 0 ? gramas / produto.pesoUnidadeG : 0;
      return gramas / 1000;
    },

    /* ================= Ficha técnica ================= */
    calcFicha(prep) {
      const out = { ingredientes: [], kcal: 0, ptn: 0, cho: 0, lip: 0, fibra: 0, sodio: 0, custo: 0, classes: {} };
      (prep.ingredientes || []).forEach(i => {
        const prod = this.get('produtos', i.produtoId);
        if (!prod) return;
        const liquido = +i.perCapita || 0;
        const fc = +i.fc || 1;
        const bruto = liquido * fc;
        const f = liquido / 100;
        const custo = this.gramasParaUnidade(prod, bruto) * this.precoMedio(prod.id);
        const r = {
          produto: prod, liquido, bruto, fc, custo,
          kcal: (prod.kcal || 0) * f, ptn: (prod.ptn || 0) * f, cho: (prod.cho || 0) * f,
          lip: (prod.lip || 0) * f, fibra: (prod.fibra || 0) * f, sodio: (prod.sodio || 0) * f
        };
        out.ingredientes.push(r);
        ['kcal', 'ptn', 'cho', 'lip', 'fibra', 'sodio', 'custo'].forEach(k => out[k] += r[k]);
        out.classes[prod.classe] = true;
      });
      out.kcalPtn = out.kcal ? (out.ptn * 4 / out.kcal) * 100 : 0;
      out.kcalCho = out.kcal ? (out.cho * 4 / out.kcal) * 100 : 0;
      out.kcalLip = out.kcal ? (out.lip * 9 / out.kcal) * 100 : 0;
      return out;
    },

    /* ================= Cardápio ================= */
    DIAS: ['seg', 'ter', 'qua', 'qui', 'sex'],
    DIAS_NOME: { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta' },

    cardapioDoDia(escolaId, dataISO) {
      const dt = new Date(dataISO + 'T12:00:00');
      const dow = dt.getDay();
      if (dow < 1 || dow > 5) return null;
      const dia = this.DIAS[dow - 1];
      const c = this.list('cardapios').filter(c => {
        if (c.escolaIds && c.escolaIds.length && !c.escolaIds.includes(escolaId)) return false;
        const ini = new Date(c.dataInicio + 'T12:00:00');
        const fim = new Date(ini); fim.setDate(fim.getDate() + 7 * (c.semanas || 1));
        return dt >= ini && dt < fim;
      }).sort((a, b) => b.dataInicio.localeCompare(a.dataInicio))[0];
      if (!c) return null;
      return { cardapio: c, dia, refeicoes: (c.dias && c.dias[dia]) || [] };
    },

    totalAlunos(escola) {
      return Object.values((escola && escola.alunos) || {}).reduce((t, n) => t + (+n || 0), 0);
    }
  };

  window.DB = DB;
})();
