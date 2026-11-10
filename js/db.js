/* AENA - Alimentação Escolar Novo Acordo
 * Camada de dados. Nesta versão os dados ficam no navegador (localStorage).
 * Toda leitura/gravação passa por DB, para facilitar trocar depois por um
 * banco online (Firebase/Supabase/Google Sheets) sem mexer nas páginas.
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
      versao: 1,
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
      log: []
    };
  }

  const DB = {
    MODALIDADES, CLASSES, GRUPOS, PAPEIS, DEFAULT_CONFIG,
    data: null,
    uid,

    load() {
      if (this.data) return this.data;
      try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.data = null; }
      if (!this.data) { this.data = seed(); this.save(); }
      // Garante coleções novas em bases antigas
      const base = seed();
      Object.keys(base).forEach(k => { if (this.data[k] === undefined) this.data[k] = base[k]; });
      this.data.config = Object.assign({}, DEFAULT_CONFIG, this.data.config);
      // Valores per capita ajustados pelo administrador sobrescrevem o padrão
      Object.entries(this.data.config.perCapita || {}).forEach(([k, v]) => {
        if (MODALIDADES[k] && +v > 0) MODALIDADES[k].perCapita = +v;
      });
      return this.data;
    },

    save() {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    },

    list(col) { return this.load()[col] || []; },
    get(col, id) { return this.list(col).find(x => x.id === id); },

    insert(col, obj) {
      obj.id = obj.id || uid();
      obj.criadoEm = obj.criadoEm || new Date().toISOString();
      const s = window.Auth && Auth.session();
      if (s) obj.criadoPor = obj.criadoPor || s.login;
      this.load()[col].push(obj);
      this.logAction('inseriu', col, obj.id);
      this.save();
      return obj;
    },

    update(col, id, patch) {
      const o = this.get(col, id);
      if (!o) return null;
      Object.assign(o, patch, { alteradoEm: new Date().toISOString() });
      this.logAction('alterou', col, id);
      this.save();
      return o;
    },

    remove(col, id) {
      const d = this.load();
      d[col] = d[col].filter(x => x.id !== id);
      this.logAction('excluiu', col, id);
      this.save();
    },

    logAction(acao, col, id) {
      const s = window.Auth && Auth.session();
      const d = this.load();
      d.log.push({ em: new Date().toISOString(), por: s ? s.login : '-', acao, col, id });
      if (d.log.length > 2000) d.log = d.log.slice(-2000);
    },

    exportJSON() { return JSON.stringify(this.load(), null, 2); },
    importJSON(txt) {
      const obj = JSON.parse(txt);
      if (!obj || !Array.isArray(obj.produtos) || !Array.isArray(obj.usuarios)) throw new Error('Arquivo inválido');
      this.data = obj; this.load(); this.save();
    },
    reset() { localStorage.removeItem(KEY); this.data = null; },

    /* ---------- Cálculos de estoque ---------- */
    estoque(produtoId) {
      const d = this.load();
      let q = 0;
      d.entradas.forEach(e => { if (e.produtoId === produtoId) q += +e.quantidade || 0; });
      d.saidas.forEach(s => { if (s.produtoId === produtoId) q -= +s.quantidade || 0; });
      return Math.round(q * 1000) / 1000;
    },

    precoMedio(produtoId) {
      let q = 0, v = 0;
      this.list('entradas').forEach(e => {
        if (e.produtoId === produtoId) { q += +e.quantidade || 0; v += (+e.quantidade || 0) * (+e.valorUnit || 0); }
      });
      return q > 0 ? v / q : 0;
    },

    // Lotes com saldo para alerta de validade (aproximação FIFO por validade)
    lotesComSaldo(produtoId) {
      const entradas = this.list('entradas').filter(e => e.produtoId === produtoId)
        .sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999'));
      let saida = this.list('saidas').filter(s => s.produtoId === produtoId)
        .reduce((t, s) => t + (+s.quantidade || 0), 0);
      const res = [];
      entradas.forEach(e => {
        const consumido = Math.min(saida, +e.quantidade || 0);
        saida -= consumido;
        const saldo = (+e.quantidade || 0) - consumido;
        if (saldo > 0.0001) res.push({ entrada: e, saldo });
      });
      return res;
    },

    // Converte gramas (ou mL) da ficha técnica para a unidade de estoque do produto
    gramasParaUnidade(produto, gramas) {
      if (!produto) return 0;
      if (produto.unidade === 'un') return produto.pesoUnidadeG > 0 ? gramas / produto.pesoUnidadeG : 0;
      return gramas / 1000; // kg ou L
    },

    /* ---------- Ficha técnica ---------- */
    calcFicha(prep) {
      const out = { ingredientes: [], kcal: 0, ptn: 0, cho: 0, lip: 0, fibra: 0, sodio: 0, custo: 0, classes: {} };
      (prep.ingredientes || []).forEach(i => {
        const prod = this.get('produtos', i.produtoId);
        if (!prod) return;
        const liquido = +i.perCapita || 0;                 // g por porção (parte comestível)
        const fc = +i.fc || 1;                              // fator de correção
        const bruto = liquido * fc;                          // g por porção (como comprado)
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

    /* ---------- Cardápio ---------- */
    DIAS: ['seg', 'ter', 'qua', 'qui', 'sex'],
    DIAS_NOME: { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta' },

    cardapioDoDia(escolaId, dataISO) {
      const dt = new Date(dataISO + 'T12:00:00');
      const dow = dt.getDay(); // 0 dom
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
