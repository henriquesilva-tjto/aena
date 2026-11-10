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

## Dois modos de funcionamento

| | Modo local | Modo online (Firebase) |
|---|---|---|
| Onde ficam os dados | Só no navegador de cada computador | Na nuvem (Google Firebase), compartilhados entre todas as escolas |
| Login | Verificado no navegador | Firebase Authentication |
| Permissões por perfil | Só na tela | Validadas no servidor (`firestore.rules`) |
| Sem internet | Funciona | Continua registrando; sincroniza quando a internet volta |
| Ativação | Padrão | Preencher `js/firebase-config.js` |

## Configurar o Firebase (modo online) — passo a passo

1. Acesse **console.firebase.google.com** com uma conta Google da Secretaria → **Adicionar projeto** (ex.: `aena-novoacordo`). O Google Analytics pode ser desativado. Plano **Spark (gratuito)**.
2. **Authentication** → *Vamos começar* → *Método de login* → ative **E-mail/senha**.
3. **Authentication** → *Configurações* → *Domínios autorizados* → adicione `henriquesilva-tjto.github.io`.
4. **Firestore Database** → *Criar banco de dados* → local **`southamerica-east1` (São Paulo)** → modo **produção**.
5. **Firestore** → aba **Regras** → apague o conteúdo, cole todo o arquivo [`firestore.rules`](firestore.rules) → **Publicar**.
6. **Configurações do projeto** (engrenagem) → *Seus apps* → ícone **`</>`** (Web) → registre o app → copie o objeto `firebaseConfig`.
7. No GitHub, edite [`js/firebase-config.js`](js/firebase-config.js): troque `window.AENA_FIREBASE = null;` pelo objeto copiado (`window.AENA_FIREBASE = { apiKey: "...", ... };`) e faça o commit na `main`.
8. Abra o site: ele vai para **`setup.html`** → crie o **administrador** (use um e-mail real, para poder recuperar a senha). Se já tiver dados no modo local, importe o backup `.json` nessa tela.
9. Em **Usuários**, crie os logins de secretaria, nutricionista, diretor e merendeiras (cada merendeira vinculada à sua escola).

> Os valores do `firebaseConfig` não são senha: a segurança vem do login e das regras do Firestore.

### Limites do plano gratuito (Spark)
50 mil leituras e 20 mil gravações por dia, e 1 GB de dados. Para um município do porte de Novo Acordo, sobra bastante. O sistema carrega só o necessário de cada página (o relatório busca apenas o período escolhido) e mantém um resumo de estoque por produto, para não reler o histórico.

### Senhas no modo online
- Cada pessoa troca a própria senha em **Alterar senha**.
- Login com **e-mail real**: o admin clica em **Enviar e-mail de nova senha** na lista de Usuários.
- Login **sem e-mail** (ex.: `maria.escola1`): a senha não pode ser redefinida pelo sistema. Desative o usuário e crie outro login.

## Primeiro acesso (modo local)

Usuários iniciais (senha **`aena2026`** — o sistema obriga a troca no primeiro login):

`admin` · `secretaria` · `nutricionista` · `diretor` · `merendeira`

Ordem sugerida: **admin** cadastra escolas e usuários → **diretor** revisa produtos e lança as entradas → **nutricionista** cria fichas técnicas e cardápios → **merendeiras** registram o dia a dia → **secretaria** acompanha o relatório.

## Publicar no GitHub Pages

Settings → Pages → Branch `main` / pasta `/ (root)` → Save. O endereço fica `https://henriquesilva-tjto.github.io/aena/`.

## Observações

- No **modo local**, use *Diretor › Backup* para exportar e importar os dados. Faça backup semanal.
- No **modo online**, exporte um backup mensal mesmo assim (Diretor › Backup) e guarde no Google Drive.
- Não guarde dados pessoais sensíveis de alunos (laudos etc.) no sistema.
- Os valores nutricionais dos produtos de exemplo são aproximados (TACO). A nutricionista deve revisar.

## Estrutura

```
index.html  setup.html  painel.html  nutricionista.html  diretor.html  merendeira.html  usuarios.html  legislacao.html
firestore.rules         (regras de segurança do Firestore — colar no Console)
css/style.css
js/firebase-config.js   (configuração do projeto Firebase; null = modo local)
js/firebase.js          (carrega o SDK do Firebase)
js/db.js                (dados nos dois modos, resumo de estoque, ficha técnica, cardápio)
js/auth.js              (login Firebase ou local, perfis, primeiro administrador)
js/ui.js                (menu, utilitários)
```
