/* AENA - utilitários de interface */
(function () {
  const UI = {
    $(sel, ctx) { return (ctx || document).querySelector(sel); },
    $$(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; },

    esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    money(v) { return (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
    num(v, d = 2) { return (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d }); },
    pct(v) { return (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; },
    hoje() {
      const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    },
    data(iso) { if (!iso) return '-'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; },
    diasAte(iso) { return Math.round((new Date(iso + 'T12:00:00') - new Date(UI.hoje() + 'T12:00:00')) / 86400000); },

    toast(msg, ms = 2800) {
      const t = document.createElement('div');
      t.className = 'toast'; t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), ms);
    },

    options(list, valueKey, labelFn, selected, vazio) {
      let h = vazio !== undefined ? `<option value="">${UI.esc(vazio)}</option>` : '';
      list.forEach(it => {
        const v = it[valueKey];
        h += `<option value="${UI.esc(v)}" ${v === selected ? 'selected' : ''}>${UI.esc(labelFn(it))}</option>`;
      });
      return h;
    },

    formData(form) {
      const o = {};
      new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
      UI.$$('input[type=checkbox]', form).forEach(c => { if (c.name) o[c.name] = c.checked; });
      return o;
    },

    fillForm(form, obj) {
      Object.keys(obj || {}).forEach(k => {
        const el = form.elements[k];
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!obj[k]; else el.value = obj[k] == null ? '' : obj[k];
      });
    },

    tabs(root) {
      const btns = UI.$$('.tabs button', root);
      const show = id => {
        btns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
        UI.$$('.tab-panel', root).forEach(p => p.classList.toggle('active', p.id === id));
        try { sessionStorage.setItem('aena_tab_' + location.pathname, id); } catch (e) { /* */ }
        document.dispatchEvent(new CustomEvent('tab', { detail: id }));
      };
      btns.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
      let ini = null;
      try { ini = sessionStorage.getItem('aena_tab_' + location.pathname); } catch (e) { /* */ }
      show(ini && UI.$('#' + ini) ? ini : btns[0].dataset.tab);
    },

    download(nome, conteudo, tipo) {
      const blob = new Blob([conteudo], { type: tipo || 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    csv(linhas) {
      return '﻿' + linhas.map(l => l.map(c => {
        const s = String(c == null ? '' : c);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';')).join('\n');
    },

    // Monta cabeçalho com menu conforme perfil
    header(sess) {
      const pagina = location.pathname.split('/').pop() || 'index.html';
      const links = [
        ['painel.html', 'Relatório'],
        ['nutricionista.html', 'Nutricionista'],
        ['diretor.html', 'Estoque / Insumos'],
        ['merendeira.html', 'Merendeira'],
        ['legislacao.html', 'Legislação'],
        ['usuarios.html', 'Usuários']
      ].filter(([p]) => (Auth.ACESSO[p] || []).includes(sess.papel));
      const bar = document.createElement('header');
      bar.className = 'topbar';
      bar.innerHTML = `
        <div class="brand">AENA<small>Alimentação Escolar · Novo Acordo-TO</small></div>
        <nav>${links.map(([p, t]) => `<a href="${p}" class="${p === pagina ? 'active' : ''}">${t}</a>`).join('')}</nav>
        <div class="user">
          <span>${UI.esc(sess.nome)} · <small style="color:#d6efe1">${UI.esc(DB.PAPEIS[sess.papel] || sess.papel)}</small></span>
          <button class="sm" id="btnSenha">Alterar senha</button>
          <button class="sm" id="btnSair">Sair</button>
        </div>`;
      document.body.prepend(bar);
      UI.$('#btnSair').onclick = () => Auth.logout();
      UI.$('#btnSenha').onclick = () => UI.alterarSenha();
    },

    async alterarSenha() {
      const atual = prompt('Senha atual:');
      if (atual == null) return;
      const nova = prompt('Nova senha (mín. 8 caracteres, letras e números):');
      if (nova == null) return;
      const erro = Auth.validaSenha(nova);
      if (erro) return alert(erro);
      if (prompt('Repita a nova senha:') !== nova) return alert('As senhas não conferem.');
      try { await Auth.alterarSenha(atual, nova); UI.toast('Senha alterada.'); }
      catch (e) { alert(e.message || 'Erro ao alterar a senha.'); }
    },

    carregando(on) {
      let el = document.getElementById('aenaCarregando');
      if (on && !el) {
        el = document.createElement('div'); el.id = 'aenaCarregando'; el.className = 'toast'; el.textContent = 'Carregando dados...';
        document.body.appendChild(el);
      }
      if (!on && el) el.remove();
    },

    /* Inicializa página protegida.
     * opts.cols: coleções que a página usa; opts.periodo: {col: [ini, fim]} (modo online). */
    async init(opts) {
      UI.carregando(true);
      try {
        const s = await Auth.guard();
        if (!s) return null;
        await DB.init(opts);
        UI.header(s);
        if (DB.modo === 'local') {
          const aviso = document.createElement('div');
          aviso.className = 'alert warn no-print'; aviso.style.margin = '0';  aviso.style.borderRadius = '0';
          aviso.innerHTML = '<b>Modo local:</b> os dados ficam só neste navegador. Configure o Firebase para compartilhar entre as escolas (ver README).';
          document.querySelector('header.topbar').after(aviso);
        }
        return s;
      } catch (e) {
        console.error(e);
        document.body.insertAdjacentHTML('afterbegin', `<div class="alert bad" style="margin:1rem">Erro ao carregar: ${UI.esc(e.message || e)}.
          Verifique a internet e recarregue. <a href="index.html">Voltar ao login</a></div>`);
        return null;
      } finally {
        UI.carregando(false);
      }
    }
  };
  window.UI = UI;
})();
