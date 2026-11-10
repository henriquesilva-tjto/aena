# AENA — Alimentação Escolar de Novo Acordo-TO

Sistema web para gerenciar a alimentação escolar (PNAE) da Secretaria Municipal de Educação de Novo Acordo-TO.
É feito em HTML/CSS/JS puro: roda no GitHub Pages ou abrindo o `index.html` direto no computador.

## Páginas e perfis

| Página | Arquivo | Quem acessa | Função |
|---|---|---|---|
| Login | `index.html` | todos | Entrada com usuário e senha |
| **Relatório (principal)** | `painel.html` | Secretaria, Nutricionista, Diretor, Admin | Refeições servidas, custos, execução do recurso, conformidade PNAE (45% AF, limites de ultraprocessados), estimativa de repasse, alertas e ocorrências. Imprime/PDF e CSV |
| Nutricionista | `nutricionista.html` | Nutricionista, Admin | Fichas técnicas (per capita, fator de correção, nutrientes, custo por porção) e cardápios semanais com checagem automática |
| Diretor de Alimentação | `diretor.html` | Diretor, Admin | Entradas (NF, lote, validade, AF, fonte), estoque, baixas/perdas, produtos, escolas, fornecedores, recursos recebidos, backup |
| Merendeira | `merendeira.html` | Merendeira, Diretor, Admin | Registro diário de refeições servidas e saídas de produtos (cálculo automático pelo cardápio × alunos) |
| Legislação | `legislacao.html` | todos | Resumo da legislação do PNAE e fontes |
| Usuários | `usuarios.html` | Admin | Usuários, perfis, vínculo de merendeira à escola, parâmetros e registro de atividades |

## Primeiro acesso

Usuários iniciais (senha **`aena2026`** — o sistema obriga a troca no primeiro login):

`admin` · `secretaria` · `nutricionista` · `diretor` · `merendeira`

Ordem sugerida: **admin** cadastra escolas e usuários → **diretor** revisa produtos e lança as entradas → **nutricionista** cria fichas técnicas e cardápios → **merendeiras** registram o dia a dia → **secretaria** acompanha o relatório.

## Publicar no GitHub Pages

Settings → Pages → Branch `main` / pasta `/ (root)` → Save. O endereço fica `https://henriquesilva-tjto.github.io/aena/`.

## Limitações desta versão (importante)

- **Os dados ficam no navegador** (localStorage) de cada computador. Merendeiras em outras escolas/aparelhos **não enxergam** os mesmos dados. Use *Diretor › Backup* para exportar/importar, e faça backup semanal.
- O login protege o uso do dia a dia, mas em site estático **não é segurança de servidor**. Não guarde dados pessoais sensíveis de alunos.
- Valores nutricionais dos produtos de exemplo são aproximados (TACO) — a nutricionista deve revisar.

**Próxima etapa recomendada:** ligar a um banco online (Firebase ou Supabase, plano gratuito) com login real. Todo acesso a dados passa por `js/db.js`, então a troca é localizada.

## Estrutura

```
index.html  painel.html  nutricionista.html  diretor.html  merendeira.html  usuarios.html  legislacao.html
css/style.css
js/db.js    (dados, estoque, ficha técnica, cardápio)
js/auth.js  (login, senhas com hash SHA-256 + sal, sessão de 8h, bloqueio após 5 tentativas)
js/ui.js    (menu, utilitários)
```
