// ==UserScript==
// @name         Tiime UI
// @namespace    https://github.com/zeldris-pro
// @version      0.14.0
// @description  Refonte de l'affichage de l'application Tiime (Transactions, Factures envoyées et reçues, Notes de frais, fenêtre Relier), boutons d'année, copier / coller d'une répartition
// @author       Zeldris
// @match        https://apps.tiime.fr/*
// @grant        none
// @run-at       document-start
// @homepage     https://tiime.zeldris.pro
// @supportURL   https://github.com/zeldris-pro/tiime-ui/issues
// @updateURL    https://raw.githubusercontent.com/zeldris-pro/tiime-ui/main/tiime-ui.user.js
// @downloadURL  https://raw.githubusercontent.com/zeldris-pro/tiime-ui/main/tiime-ui.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Réglages ----------
  const CONFIG = {
    // Couleur du liseré à gauche de chaque ligne, selon le logo de la banque
    banques: {
      'hello_bank': '#00b3a6',
      'cic': '#7c5cff',
      'american_express': '#2f7de1',
    },
    // Masque le tag sous l'intitulé quand il répète le label
    masquerTagsDoublons: true,
    // Comptes : noms courts affichés dans la barre (clé = id Tiime du compte), par exemple
    // { 123456: 'Compte pro', 234567: 'Carte' }. Sans nom court, le nom donné par Tiime s'affiche.
    nomsComptes: {},
    // Banques jamais affichées, même si le compte est encore actif chez Tiime, par exemple ['qonto']
    banquesExclues: [],
    // Filtre de date ajouté en arrivant sur Transactions : 'annee' = depuis le 1er janvier, false = aucun
    dateParDefaut: 'annee',
    // Récap des montants sous les banques
    recap: true,
    // Factures envoyées : année du récap au chargement ('courante' ou false pour tout afficher).
    // La liste n'est pas filtrée, seul le calcul utilise la date de chaque facture.
    anneeFactures: 'courante',
    // Première année proposée dans les boutons d'année (Transactions, Factures reçues)
    premiereAnnee: 2023,
    // Notes de frais : masque la colonne « Propriétaire » (toujours toi)
    masquerProprietaire: true,
  };

  // Réglages perso gardés dans le navigateur : ils survivent aux mises à jour du script.
  // Dans la console de apps.tiime.fr : localStorage.setItem('tiime-ui-config', JSON.stringify({ nomsComptes: { 123456: 'Compte pro' } }))
  try {
    Object.assign(CONFIG, JSON.parse(localStorage.getItem('tiime-ui-config') || '{}'));
  } catch (e) { /* réglages illisibles ou stockage indisponible : on garde ceux du fichier */ }

  // ---------- Filtre de date par défaut ----------
  const PAGE_TRANSACTIONS = /^\/companies\/\d+\/account\/transactions\/?$/;
  const SANS_DATE = 'tui-sans-date-par-defaut';

  function urlAvecDateParDefaut() {
    if (!CONFIG.dateParDefaut || !PAGE_TRANSACTIONS.test(location.pathname)) return null;
    const url = new URL(location.href);
    if (url.searchParams.has('date')) return null;
    try {
      if (sessionStorage.getItem(SANS_DATE)) {
        sessionStorage.removeItem(SANS_DATE);
        return null;
      }
    } catch (e) { /* stockage indisponible */ }
    url.searchParams.set('date', '>=' + new Date().getFullYear() + '-01-01');
    url.searchParams.set('page', '1');
    return url;
  }

  // Au chargement : Tiime n'a encore rien lu, on corrige l'adresse tout de suite
  const urlInitiale = urlAvecDateParDefaut();
  if (urlInitiale) {
    location.replace(urlInitiale);
    return;
  }

  // ---------- Styles ----------
  const T = 'app-transactions';
  // Tableaux de transactions : la page Transactions et celui de la fenêtre « Relier »
  const TL = ':is(app-transactions, app-transactions-matching-table)';
  const R = 'app-matching-dialog';
  const FR = 'app-expense-invoice';
  const NF = 'app-expense-reports';
  // Factures : la page est repérée par son adresse, pas par le nom interne du composant Tiime
  const F = 'html[data-tui-page="factures"]';
  const PAGE_FACTURES = /^\/companies\/\d+\/invoice\/invoices\/?$/;
  const LIGNE_FACTURE = 'tds-body-row[data-cy^="invoice-list-item-"]';
  const CSS = `
    ${TL} {
      --tui-text: #1f2937;
      --tui-muted: #64748b;
      --tui-line: #edf0f5;
      --tui-hover: #f3f7ff;
      --tui-credit: #15803d;
      --tui-sub-bg: #f8fafc;
    }

    /* Colonnes : l'intitulé prend la place, le reste est serré */
    ${T} tds-head-row,
    ${T} tds-body-row {
      grid-template-columns:
        24px 36px 80px 24px minmax(220px, 1fr) 112px 200px minmax(120px, .45fr) 160px !important;
      column-gap: 10px !important;
    }

    /* Lignes compactes séparées par un trait au lieu de cartes espacées */
    ${TL} .tds-table-body-section { row-gap: 0 !important; }
    ${TL} tds-body-row {
      min-height: 30px !important;
      border-radius: 0 !important;
      border-bottom: 1px solid var(--tui-line) !important;
      box-shadow: inset 3px 0 0 var(--tui-bank, transparent);
      transition: background-color .1s;
    }
    ${TL} tds-body-row:first-child { border-radius: 8px 8px 0 0 !important; }
    ${TL} tds-body-row:hover { background-color: var(--tui-hover) !important; }
    ${TL} tds-body-row tds-cell { padding-block: 0 !important; }

    /* En-tête de colonnes */
    ${TL} tds-head-row tds-cell {
      font-size: 11px !important;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: var(--tui-muted) !important;
    }

    /* En-tête « Banque » : on garde seulement le filtre, la colonne est étroite */
    ${TL} tds-head-row tds-cell:nth-child(2) .tds-cell-projected-content { display: none !important; }

    /* Barre de recherche moins haute */
    ${T} app-boxed-action-bar { min-height: 0 !important; }
    ${T} app-boxed-action-bar > * { padding-block: 4px !important; }

    /* Logo de banque un peu plus grand */
    ${TL} tds-body-row app-bank-logo .size-5 { width: 22px !important; height: 22px !important; }

    /* Date */
    ${TL} .tiime-date-list-cell-label {
      color: var(--tui-muted) !important;
      font-weight: 600 !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    /* Intitulé */
    ${TL} .wording-cell app-transaction-wording span,
    ${TL} tds-body-row .tds-font-ellipsed.block {
      color: var(--tui-text) !important;
      font-size: 13.5px !important;
      font-weight: 600 !important;
    }
    ${TL} app-tags-list[data-tui-dup] { display: none !important; }

    /* Montants : chiffres alignés, débit sombre, crédit vert */
    ${TL} .amount {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-variant-numeric: tabular-nums;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: var(--tui-text) !important;
      white-space: nowrap;
    }
    ${TL} .amount[data-tui-credit] { color: var(--tui-credit) !important; }

    /* Labels plus discrets */
    ${TL} app-labels-column-content .tds-chips,
    ${TL} tds-body-row app-label-select .tds-chips {
      font-size: 11.5px !important;
      border-color: var(--tui-line) !important;
    }

    /* Commentaire */
    ${TL} tds-text-cell input { font-size: 12.5px !important; color: var(--tui-muted) !important; }

    /* Sous-lignes de ventilation : en retrait et grisées */
    ${TL} tds-body-row:has(app-imputation-row) {
      background-color: var(--tui-sub-bg) !important;
      min-height: 26px !important;
    }
    ${TL} tds-body-row:has(app-imputation-row) .tds-font-ellipsed.block {
      color: var(--tui-muted) !important;
      font-weight: 500 !important;
      font-size: 12.5px !important;
    }
    ${TL} tds-body-row:has(app-imputation-row) .amount {
      font-weight: 500 !important;
      font-size: 13px !important;
      color: var(--tui-muted) !important;
    }

    /* ---------- Barre des comptes ---------- */
    ${T} app-bank-account-amount,
    ${T} app-bank-account-card,
    ${T} app-bank-account-selector button[aria-label="Autres comptes"] { display: none !important; }

    #tui-comptes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 10px 0 0;
      font-family: Nunito, "Helvetica Neue", sans-serif;
    }
    #tui-comptes a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 12px 0 8px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      color: #1f2937;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: border-color .1s, background-color .1s;
    }
    #tui-comptes a:hover { border-color: #94a3b8; }
    #tui-comptes a[data-actif] {
      border-color: #2f7de1;
      background: #eef5ff;
      box-shadow: 0 0 0 1px #2f7de1 inset;
    }
    #tui-comptes img { width: 18px; height: 18px; border-radius: 4px; object-fit: contain; }
    #tui-comptes .tui-solde {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
    #tui-comptes .tui-solde.neg { color: #b91c1c; }
    #tui-comptes .tui-tous { font-weight: 700; }

    /* ---------- Récap des montants ---------- */
    .tui-recap {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      margin: 8px 0 0;
      font-family: Nunito, "Helvetica Neue", sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }
    .tui-recap .tui-tete {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
      font-size: 13px;
      color: #1f2937;
    }
    .tui-recap .tui-titre { font-weight: 700; }
    .tui-recap .tui-petit, .tui-recap .tui-sep { color: #94a3b8; font-weight: 600; }
    .tui-recap .tui-alerte { color: #b45309; }
    .tui-recap .tui-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 24px;
      padding: 0 8px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #fff;
      color: #334155;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
    }
    .tui-recap .tui-label:hover { border-color: #94a3b8; background: #f8fafc; }
    .tui-recap .tui-label[data-actif] {
      border-color: #2f7de1;
      background: #eef5ff;
      box-shadow: 0 0 0 1px #2f7de1 inset;
    }
    .tui-recap .tui-point { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    .tui-recap .tui-solde {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: #1f2937;
    }
    .tui-recap .tui-solde.pos { color: #15803d; }
    .tui-recap .tui-label.tui-fixe { cursor: default; }
    .tui-recap .tui-label.tui-fixe:hover { border-color: #e2e8f0; background: #fff; }
    .tui-recap .tui-groupe { color: #94a3b8; margin: 0 2px 0 8px; }
    /* Retour à la ligne dans un récap */
    .tui-recap .tui-ligne { flex-basis: 100%; height: 0; }
    .tui-recap .tui-ligne + .tui-groupe { margin-left: 0; }
    .tui-recap .tui-annees { display: inline-flex; gap: 4px; }
    .tui-recap .tui-annees button {
      height: 24px;
      padding: 0 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #fff;
      color: #475569;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .tui-recap .tui-annees button:hover { border-color: #94a3b8; }
    .tui-recap .tui-annees button[data-actif] { background: #2f7de1; border-color: #2f7de1; color: #fff; }

    /* ---------- Factures envoyées ---------- */
    ${F} tds-head-row,
    ${F} tds-body-row {
      grid-template-columns: 96px 24px 110px minmax(240px, 1fr) 120px 130px 90px !important;
      column-gap: 10px !important;
    }
    ${F} .tds-table-body-section { row-gap: 0 !important; }
    ${F} tds-body-row {
      min-height: 30px !important;
      border-radius: 0 !important;
      border-bottom: 1px solid #edf0f5 !important;
    }
    ${F} tds-body-row[data-tui-coupure] { border-top: 2px solid #cbd5e1 !important; }
    ${F} tds-body-row:hover { background-color: #f3f7ff !important; }
    ${F} tds-body-row > * { padding-block: 0 !important; }
    ${F} tds-head-row tds-cell {
      font-size: 11px !important;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #64748b !important;
    }
    /* Date avec l'année */
    ${F} tds-body-row > tds-cell:first-child .tds-cell-projected-content {
      color: #64748b;
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    ${F} tds-body-row > tds-cell:first-child .tds-cell-projected-content[data-tui-annee]::after {
      content: " " attr(data-tui-annee);
      color: #94a3b8;
      font-weight: 500;
    }
    ${F} app-invoicing-document-tile { transform: scale(.85); }
    ${F} tds-body-row > tds-cell:nth-child(3) { font-size: 13px; color: #334155; }
    ${F} app-invoicing-document-client-cell > div { font-size: 13.5px !important; }
    ${F} app-invoicing-document-client-cell .ellipsis:first-child { color: #1f2937; font-weight: 700; }
    /* Montant */
    ${F} tds-body-row > tds-cell:nth-child(5) {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-variant-numeric: tabular-nums;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #1f2937 !important;
    }
    /* Statut en petite pastille */
    ${F} tds-select-cell .tds-form-field-content-container {
      min-height: 0 !important;
      height: 22px !important;
      padding: 0 8px !important;
      border: 0 !important;
      border-radius: 11px !important;
      background: var(--tui-statut-fond, #f1f5f9) !important;
      box-shadow: none !important;
    }
    ${F} tds-select-cell .tds-select-cell-option-label {
      font-size: 12px !important;
      font-weight: 700 !important;
      color: var(--tui-statut, #475569) !important;
    }
    ${F} tds-select-cell .tds-form-field-input-suffix { color: var(--tui-statut, #475569) !important; }
    ${F} tds-body-row[data-tui-statut="draft"]    { --tui-statut: #64748b; --tui-statut-fond: #f1f5f9; }
    ${F} tds-body-row[data-tui-statut="sent"]     { --tui-statut: #1d4ed8; --tui-statut-fond: #e0ecff; }
    ${F} tds-body-row[data-tui-statut="received"] { --tui-statut: #6d28d9; --tui-statut-fond: #ede9fe; }
    ${F} tds-body-row[data-tui-statut="paid"]     { --tui-statut: #15803d; --tui-statut-fond: #dcfce7; }
    ${F} tds-body-row[data-tui-retard]            { --tui-statut: #b91c1c; --tui-statut-fond: #fee2e2; }
    ${F} tds-body-row[data-tui-retard] > tds-cell:first-child { box-shadow: inset 3px 0 0 #dc2626; }

    /* ---------- Fenêtre « Relier » (partout où elle s'ouvre) ---------- */
    app-transactions-matching-table tds-head-row,
    app-transactions-matching-table tds-body-row {
      grid-template-columns: 36px 36px 80px 24px minmax(200px, 1fr) 112px 180px 84px !important;
      column-gap: 10px !important;
    }
    ${R} .tds-table-body-section { row-gap: 0 !important; }
    ${R} tds-body-row {
      min-height: 30px !important;
      border-radius: 0 !important;
      border-bottom: 1px solid #edf0f5 !important;
    }
    ${R} tds-body-row > * { padding-block: 0 !important; }
    ${R} tds-body-row:hover { background-color: #f3f7ff !important; }
    ${R} tds-head-row tds-cell {
      font-size: 11px !important;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #64748b !important;
    }
    /* Montant identique au document : vert ; proche (moins de 10 % d'écart) : orange */
    ${R} tds-body-row[data-tui-match="exact"] {
      background-color: #ecfdf5 !important;
      box-shadow: inset 4px 0 0 #16a34a !important;
    }
    ${R} tds-body-row[data-tui-match="proche"] {
      background-color: #fffbeb !important;
      box-shadow: inset 4px 0 0 #f59e0b !important;
    }
    ${R} tds-body-row[data-tui-match="exact"] .amount { color: #15803d !important; }
    ${R} tds-body-row[data-tui-match="proche"] .amount { color: #b45309 !important; }

    /* ---------- Factures reçues ---------- */
    ${FR} tds-head-row,
    ${FR} tds-body-row {
      grid-template-columns: 32px 92px 28px 76px minmax(220px, 1fr) 110px 180px 80px 96px 0px 70px !important;
      column-gap: 10px !important;
    }
    /* Colonne « Payer » : réservée au compte pro Tiime, toujours grisée */
    ${FR} tds-head-row > :nth-child(10),
    ${FR} tds-body-row > :nth-child(10) { visibility: hidden; overflow: hidden; min-width: 0; }
    ${FR} .tds-table-body-section { row-gap: 0 !important; }
    ${FR} tds-body-row {
      min-height: 30px !important;
      border-radius: 0 !important;
      border-bottom: 1px solid #edf0f5 !important;
    }
    ${FR} tds-body-row[data-tui-coupure] { border-top: 2px solid #cbd5e1 !important; }
    ${FR} tds-body-row > * { padding-block: 0 !important; }
    ${FR} tds-body-row:hover { background-color: #f3f7ff !important; }
    ${FR} tds-head-row tds-cell {
      font-size: 11px !important;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #64748b !important;
    }
    ${FR} .tiime-date-list-cell-label {
      color: #64748b !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    ${FR} .tiime-date-list-cell-label[data-tui-annee]::after {
      content: " " attr(data-tui-annee);
      color: #94a3b8;
      font-weight: 500;
    }
    ${FR} app-category-icon { transform: scale(.8); }
    ${FR} tds-body-row > :nth-child(4) { font-size: 12px; color: #94a3b8; }
    ${FR} app-documents-name-column-content .name {
      color: #1f2937 !important;
      font-size: 13.5px !important;
      font-weight: 700 !important;
    }
    ${FR} app-tags-list[data-tui-dup] { display: none !important; }
    ${FR} app-documents-amount-column-content {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-variant-numeric: tabular-nums;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #1f2937 !important;
      white-space: nowrap;
    }
    ${FR} app-label-chip tiime-chip { font-size: 11.5px !important; }
    ${FR} tds-badge { width: auto !important; min-width: 0 !important; }
    /* Facture sans transaction reliée : liseré orange et bouton « Relier » toujours visible */
    ${FR} tds-body-row[data-tui-arelier] { box-shadow: inset 3px 0 0 #f59e0b; }
    ${FR} tds-body-row[data-tui-arelier] .show-on-hover { opacity: 1 !important; visibility: visible !important; }
    /* L'année de Tiime passe à droite de la date, au lieu d'une seconde ligne */
    ${FR} .tiime-date-list-cell-year { display: none !important; }

    /* ---------- Notes de frais ---------- */
    ${NF} tds-head-row,
    ${NF} tds-body-row {
      grid-template-columns: 32px 92px 28px minmax(260px, 1fr) var(--tui-proprio, 148px) 110px 92px 104px 44px !important;
      column-gap: 10px !important;
    }
    html[data-tui-sans-proprio] ${NF} { --tui-proprio: 0px; }
    html[data-tui-sans-proprio] ${NF} :is(tds-head-row, tds-body-row) > :nth-child(5) { visibility: hidden; overflow: hidden; min-width: 0; }
    ${NF} .tds-table-body-section { row-gap: 0 !important; }
    ${NF} tds-body-row {
      min-height: 30px !important;
      border-radius: 0 !important;
      border-bottom: 1px solid #edf0f5 !important;
    }
    ${NF} tds-body-row[data-tui-coupure] { border-top: 2px solid #cbd5e1 !important; }
    ${NF} tds-body-row > * { padding-block: 0 !important; }
    ${NF} tds-body-row:hover { background-color: #f3f7ff !important; }
    ${NF} tds-head-row tds-cell {
      font-size: 11px !important;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #64748b !important;
    }
    ${NF} .tiime-date-list-cell-year { display: none !important; }
    ${NF} .tiime-date-list-cell-label {
      color: #64748b !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    ${NF} .tiime-date-list-cell-label[data-tui-annee]::after {
      content: " " attr(data-tui-annee);
      color: #94a3b8;
      font-weight: 500;
    }
    /* Échéance : en gris, c'est presque toujours la date de la note */
    ${NF} tds-body-row > :nth-child(7) .tiime-date-list-cell-label { color: #94a3b8 !important; font-weight: 500 !important; }
    ${NF} app-category-icon { transform: scale(.8); }
    ${NF} app-documents-name-column-content .document-text__up { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    ${NF} app-documents-name-column-content .name {
      color: #1f2937 !important;
      font-size: 13.5px !important;
      font-weight: 700 !important;
      flex: 0 1 auto;
      min-width: 0;
    }
    ${NF} .tui-detail {
      flex: 0 1000 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 600;
    }
    ${NF} app-documents-amount-column-content {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-variant-numeric: tabular-nums;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #1f2937 !important;
      white-space: nowrap;
    }
    ${NF} tds-badge { width: auto !important; min-width: 0 !important; }
    /* Note enregistrée mais pas encore remboursée : liseré orange */
    ${NF} tds-body-row[data-tui-arembourser] { box-shadow: inset 3px 0 0 #f59e0b; }
    ${NF} tds-body-row[data-tui-brouillon] app-documents-amount-column-content { color: #94a3b8 !important; }

    /* ---------- Copier / coller une répartition ---------- */
    ${T} .tui-rep { display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle; }
    ${T} .tui-rep button {
      height: 24px;
      padding: 0 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
      color: #475569;
      font: 700 11.5px Nunito, "Helvetica Neue", sans-serif;
      white-space: nowrap;
      cursor: pointer;
    }
    ${T} .tui-rep button:hover { border-color: #2f7de1; color: #2f7de1; }
    ${T} .tui-rep .tui-copier { opacity: 0; }
    ${T} tds-body-row:hover .tui-copier, ${T} .tui-rep .tui-copier[data-actif] { opacity: 1; }
    ${T} .tui-rep .tui-copier[data-actif] { border-color: #2f7de1; background: #eef5ff; color: #2f7de1; }
    ${T} .tui-rep .tui-coller { border-color: #2f7de1; background: #2f7de1; color: #fff; }
    ${T} .tui-rep .tui-coller:hover { background: #1d64c4; color: #fff; }
    ${T} .tui-rep .tui-coller:disabled { border-color: #e2e8f0; background: #f1f5f9; color: #94a3b8; cursor: default; }
    #tui-presse {
      position: fixed;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      max-width: calc(100vw - 32px);
      padding: 8px 10px 8px 14px;
      border-radius: 10px;
      background: #0f172a;
      color: #cbd5e1;
      font: 600 12.5px Nunito, "Helvetica Neue", sans-serif;
      box-shadow: 0 8px 24px rgba(15, 23, 42, .25);
    }
    #tui-presse b { color: #fff; }
    /* Pendant le rafraîchissement après un collage, la page 404 de Tiime passe une fraction de seconde */
    html[data-tui-rafraichir] app-not-found { visibility: hidden !important; }
    #tui-presse .tui-l { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    #tui-presse .tui-point { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    #tui-presse .tui-m { color: #fff; font-variant-numeric: tabular-nums; }
    #tui-presse button {
      height: 24px;
      padding: 0 10px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: transparent;
      color: #e2e8f0;
      font: inherit;
      cursor: pointer;
    }
    #tui-presse button:hover { border-color: #94a3b8; }
  `;

  // Feuille de style ajoutée à la main : marche avec Userscripts (Safari), Tampermonkey et Violentmonkey
  console.info('[Tiime UI] script chargé');
  const style = document.createElement('style');
  style.id = 'tiime-ui';
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  // ---------- Panneau d'un justificatif ----------
  // Tiime met ses marges en !important dans une couche CSS (@layer utilities), qui bat
  // tout !important hors couche. Une couche déclarée avant la sienne l'emporte : ces règles
  // vont donc dans « tui-fort », placée en tête du document, avant les feuilles de Tiime.
  const P = 'app-document-side-panel';
  const CSS_FORT = `@layer tui-fort {
    ${P} > header { height: 48px !important; padding-inline: 16px !important; }

    /* Résumé : le montant seul, le nom et la date sont déjà dans les champs dessous */
    ${P} app-document-summary-section { padding: 8px 16px !important; gap: 2px !important; }
    ${P} app-document-summary-section > h2,
    ${P} app-document-summary-section [data-cy="document-informations__txt__created-at"] { display: none !important; }
    ${P} app-document-summary-section .tds-headline-lg { font-size: 22px !important; line-height: 1.25 !important; }
    ${P} tds-form-field[label="Nom du document"] { margin-top: 6px !important; }

    /* Sections moins hautes */
    ${P} section { padding-block: 10px !important; }
    ${P} section > div.mb-2:first-child { margin-bottom: 6px !important; }
    ${P} section h2.tds-title-sm { font-size: 13px !important; }
    ${P} section > div:first-child > tds-svg-asset { width: 16px !important; height: 16px !important; }

    /* Espace, label et propriétaire : titre à gauche, valeur à droite, sur une ligne */
    ${P} :is(app-document-category-section, app-document-owner-section, app-document-label-section) section {
      display: grid !important;
      grid-template-columns: 150px minmax(0, 1fr);
      align-items: center;
      column-gap: 8px;
    }
    ${P} :is(app-document-category-section, app-document-owner-section, app-document-label-section) section > div:first-child { margin-bottom: 0 !important; }
    ${P} :is(app-document-category-section, app-document-owner-section) .w-3\/5,
    ${P} app-document-owner-section tds-form-field { width: 100% !important; }
    ${P} :is(app-document-category-section, app-document-owner-section) .tds-form-field-label { display: none !important; }
    ${P} app-document-label-section section > div:last-child { min-height: 0 !important; padding-block: 0 !important; }
    ${P} app-label-chip.large tiime-chip { height: 30px !important; min-height: 0 !important; }

    /* Informations du document : lignes basses, « Voir plus » sur la ligne du titre */
    ${P} app-document-metadata-section section { position: relative !important; }
    ${P} app-document-metadata-section section button.self-end { position: absolute !important; top: 6px !important; right: 20px !important; }
    ${P} app-document-metadata-form tds-body-row { min-height: 30px !important; }
    ${P} app-document-metadata-form tds-body-row > * { padding-block: 0 !important; }
    ${P} app-document-metadata-form .tds-form-field-content-container { min-height: 28px !important; height: 28px !important; }
    ${P} app-document-metadata-form .tds-form-field-footer { display: none !important; }

    /* Éléments associés et commentaire */
    ${P} .tds-list-tile { padding-block: 6px !important; min-height: 0 !important; }
    ${P} app-document-associated-elements-section section { gap: 4px !important; }
    ${P} textarea { height: 44px !important; min-height: 44px !important; }
  }`;
  const styleFort = document.createElement('style');
  styleFort.id = 'tiime-ui-fort';
  styleFort.textContent = CSS_FORT;
  (document.head || document.documentElement).prepend(styleFort);

  // ---------- Ajustements DOM ----------
  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

  function traiterLigne(row) {
    // Liseré de couleur selon la banque
    const src = row.querySelector('app-bank-logo img')?.getAttribute('src') || '';
    const cle = Object.keys(CONFIG.banques).find((k) => src.includes(k));
    if (cle) row.style.setProperty('--tui-bank', CONFIG.banques[cle]);

    // Montant positif
    const amount = row.querySelector('.amount');
    if (amount) amount.toggleAttribute('data-tui-credit', !amount.textContent.includes('-'));

    // Tag identique au label
    const tags = row.querySelector('app-tags-list');
    if (tags) {
      const t = [...tags.querySelectorAll('tiime-chip')].map((c) => norm(c.textContent)).sort().join('|');
      const l = [...row.querySelectorAll('app-label-select .tds-font-ellipsed')].map((c) => norm(c.textContent)).sort().join('|');
      tags.toggleAttribute('data-tui-dup', CONFIG.masquerTagsDoublons && t !== '' && t === l);
    }
  }

  // ---------- Barre des comptes ----------
  const API = 'https://chronos-api.tiime-apps.com/v1/accounts/companies/';
  const enTetes = (accept) => ({
    Authorization: 'Bearer ' + localStorage.getItem('access_token'),
    Accept: accept,
    'tiime-app': 'tiime',
  });
  const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  let comptes = null;        // liste chargée depuis l'API Tiime
  let comptesSociete = null; // société pour laquelle la liste a été chargée
  let chargement = false;

  function societeCourante() {
    return location.pathname.match(/\/companies\/(\d+)/)?.[1] || null;
  }

  async function chargerComptes(societe) {
    chargement = true;
    try {
      const r = await fetch(API + societe + '/bank_accounts', {
        headers: enTetes('application/json'),
      });
      const liste = r.ok ? await r.json() : [];
      comptes = liste.filter((c) =>
        !c.closed &&
        !CONFIG.banquesExclues.some((b) => (c.bank?.name || c.bank_name || '').toLowerCase().includes(b))
      );
      comptesSociete = societe;
    } catch (e) {
      console.warn('[Tiime UI] comptes non chargés', e);
      comptes = [];
      comptesSociete = societe;
    } finally {
      chargement = false;
      planifier();
    }
  }

  function allerAuCompte(id) {
    const url = new URL(location.href);
    url.searchParams.set('page', '1');
    if (id) url.searchParams.set('bank_account', id);
    else url.searchParams.delete('bank_account');
    // Si tu as retiré le filtre de date, on ne le remet pas au rechargement
    retenirSansDate(url);
    // Tiime ne relit le compte choisi qu'au chargement : on recharge la page
    location.assign(url);
  }

  function lienCompte(compte) {
    const a = document.createElement('a');
    const id = compte ? String(compte.id) : '';
    a.dataset.id = id;
    if (compte) {
      const logo = compte.bank?.logo_url;
      a.innerHTML = (logo ? `<img alt="">` : '') + `<span class="tui-nom"></span><span class="tui-solde"></span>`;
      if (logo) a.querySelector('img').src = logo;
      a.querySelector('.tui-nom').textContent = CONFIG.nomsComptes[compte.id] || compte.name;
      a.querySelector('.tui-solde').textContent = euros.format(compte.balance_amount);
      a.querySelector('.tui-solde').classList.toggle('neg', compte.balance_amount < 0);
      a.title = `${compte.bank?.name || ''} · ${compte.name}`;
    } else {
      const total = comptes.reduce((s, c) => s + (c.balance_amount || 0), 0);
      a.innerHTML = `<span class="tui-tous">Tous</span><span class="tui-solde"></span>`;
      a.querySelector('.tui-solde').textContent = euros.format(total);
      a.querySelector('.tui-solde').classList.toggle('neg', total < 0);
    }
    a.addEventListener('click', (e) => { e.preventDefault(); allerAuCompte(id); });
    return a;
  }

  function barreComptes() {
    const bar = document.querySelector(`${T} app-boxed-action-bar`);
    if (!bar) return;
    const societe = societeCourante();
    if (!societe) return;
    if (comptesSociete !== societe) {
      if (!chargement) chargerComptes(societe);
      return;
    }
    let barre = document.getElementById('tui-comptes');
    if (!barre || bar.nextElementSibling !== barre) {
      barre?.remove();
      barre = document.createElement('div');
      barre.id = 'tui-comptes';
      barre.append(lienCompte(null), ...comptes.map(lienCompte));
      bar.after(barre);
    }
    const actif = new URL(location.href).searchParams.get('bank_account') || '';
    barre.querySelectorAll('a').forEach((a) => a.toggleAttribute('data-actif', a.dataset.id === actif));
    gererRecap(barre);
  }

  // ---------- Récap des montants ----------
  // Interroge l'API avec les mêmes filtres que la page, donc toutes les pages de résultats comptent
  let recapCle = null;   // filtres du dernier calcul
  let recapDonnees = null;
  let recapMinuteur = null;

  function cleFiltres() {
    const p = new URLSearchParams(location.search);
    p.delete('page');
    p.sort();
    return location.pathname + '?' + p;
  }

  async function calculerRecap(cle) {
    const societe = societeCourante();
    const p = new URLSearchParams(location.search);
    p.delete('page');
    try {
      const r = await fetch(API + societe + '/bank_transactions?' + p, {
        headers: {
          ...enTetes('application/vnd.tiime.bank_transactions.v2+json,application/vnd.tiime.bank_transactions.without_documents+json'),
          Range: 'items=0-4999',
        },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (cle !== recapCle) return; // les filtres ont changé entre-temps
      const liste = j.transactions || [];
      const labels = new Map();
      let entrees = 0;
      let sorties = 0;
      for (const t of liste) {
        if (t.amount >= 0) entrees += t.amount; else sorties += t.amount;
        const imps = t.imputations?.length ? t.imputations : [{ amount: t.amount, label: null }];
        for (const i of imps) {
          const nom = i.label?.name || 'Sans label';
          const l = labels.get(nom) || { nom, id: i.label?.id || null, couleur: i.label?.color || '#cbd5e1', total: 0, n: 0 };
          l.total += i.amount;
          l.n += 1;
          labels.set(nom, l);
        }
      }
      const total = r.headers.get('content-range')?.split('/')[1];
      recapDonnees = {
        n: liste.length,
        liste,
        nTotal: Number(total) || liste.length,
        total: j.metadata?.total_amount ?? entrees + sorties,
        entrees,
        sorties,
        labels: [...labels.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      };
    } catch (e) {
      console.warn('[Tiime UI] récap non calculé', e);
      if (cle === recapCle) recapDonnees = { erreur: true };
    }
    planifier();
  }

  // Adresse de la page filtrée sur un label ; si ce label est déjà le filtre actif, on le retire
  function urlLabel(l) {
    const url = new URL(location.href);
    const actif = estLabelActif(l);
    for (const k of ['labels', 'label_name', 'has_label']) url.searchParams.delete(k);
    url.searchParams.set('page', '1');
    if (!actif) {
      if (l.id) url.searchParams.set('labels', l.id);
      else url.searchParams.set('has_label', 'false');
    }
    return url;
  }
  function estLabelActif(l) {
    const p = new URLSearchParams(location.search);
    return l.id ? p.get('labels') === String(l.id) : p.get('has_label') === 'false';
  }
  // Retient que tu as retiré le filtre de date, pour ne pas le remettre au rechargement
  function retenirSansDate(url) {
    if (url.searchParams.has('date')) return;
    try { sessionStorage.setItem(SANS_DATE, '1'); } catch (e) { /* stockage indisponible */ }
  }

  function montant(el, v) {
    el.textContent = euros.format(v);
    el.classList.toggle('neg', v < 0);
    el.classList.toggle('pos', v > 0);
    return el;
  }

  function dessinerRecap(recap) {
    const span = (cls, txt) => {
      const e = document.createElement('span');
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    recap.replaceChildren(boutonsAnnees(true), span('tui-ligne'));
    if (!recapDonnees) {
      recap.append('Calcul en cours…');
      return;
    }
    if (recapDonnees.erreur) {
      recap.append('Récap indisponible');
      return;
    }
    const d = recapDonnees;
    const tete = span('tui-tete');
    tete.append(
      span('tui-titre', `${d.n} opération${d.n > 1 ? 's' : ''}`),
      montant(span('tui-solde'), d.total),
      span('tui-sep', '·'), span('tui-petit', 'entrées'), montant(span('tui-solde'), d.entrees),
      span('tui-sep', '·'), span('tui-petit', 'sorties'), montant(span('tui-solde'), d.sorties),
    );
    if (d.nTotal > d.n) tete.append(span('tui-alerte', `(sur ${d.nTotal}, limite atteinte)`));
    recap.append(tete);
    for (const l of d.labels) {
      const c = document.createElement('a');
      c.className = 'tui-label';
      const url = urlLabel(l);
      c.href = url.href;
      c.toggleAttribute('data-actif', estLabelActif(l));
      c.addEventListener('click', () => retenirSansDate(url));
      c.style.setProperty('--c', l.couleur);
      c.title = `${l.n} ligne${l.n > 1 ? 's' : ''} · ` + (estLabelActif(l) ? 'cliquer pour retirer le filtre' : 'cliquer pour filtrer sur ce label');
      c.append(span('tui-point'), span('tui-nom', l.nom), montant(span('tui-solde'), l.total));
      recap.append(c);
    }
  }

  function gererRecap(barre) {
    if (!CONFIG.recap) return;
    let recap = document.getElementById('tui-recap');
    if (!recap || barre.nextElementSibling !== recap) {
      recap?.remove();
      recap = document.createElement('div');
      recap.id = 'tui-recap';
      recap.className = 'tui-recap';
      barre.after(recap);
      recap.dataset.cle = '';
    }
    const cle = cleFiltres();
    if (cle !== recapCle) {
      recapCle = cle;
      recapDonnees = null;
      clearTimeout(recapMinuteur);
      recapMinuteur = setTimeout(() => calculerRecap(cle), 300);
    }
    const etat = recapDonnees ? (recapDonnees.erreur ? 'erreur' : cle + '#' + recapDonnees.n) : 'calcul';
    if (recap.dataset.cle !== etat) {
      recap.dataset.cle = etat;
      dessinerRecap(recap);
    }
  }

  // ---------- Boutons d'année (Transactions, Factures reçues) ----------
  // Filtre de date de Tiime : « >=2025-01-01,<=2025-12-31 » pour une année passée,
  // « >=2026-01-01 » pour l'année en cours (comme le filtre par défaut)
  function valeurAnnee(a) {
    return a === String(new Date().getFullYear()) ? `>=${a}-01-01` : `>=${a}-01-01,<=${a}-12-31`;
  }
  function anneeActive() {
    const v = new URLSearchParams(location.search).get('date');
    if (!v) return 'tout';
    const m = v.match(/^>=(\d{4})-01-01(?:,<=(\d{4})-12-31)?$/);
    if (!m || (m[2] && m[2] !== m[1])) return null;
    return m[2] || m[1] === String(new Date().getFullYear()) ? m[1] : null;
  }
  function boutonsAnnees(surTransactions) {
    const choix = document.createElement('span');
    choix.className = 'tui-annees';
    const actif = anneeActive();
    const annees = [];
    for (let a = new Date().getFullYear(); a >= CONFIG.premiereAnnee; a--) annees.push(String(a));
    for (const a of [...annees, 'tout']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a === 'tout' ? 'Tout' : a;
      b.toggleAttribute('data-actif', a === actif);
      b.title = a === 'tout' ? 'Retirer le filtre de date' : `Du 01/01/${a} au 31/12/${a}`;
      b.addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('page', '1');
        if (a === 'tout') url.searchParams.delete('date');
        else url.searchParams.set('date', valeurAnnee(a));
        if (surTransactions) retenirSansDate(url);
        // Tiime ne relit le filtre qu'au chargement
        location.assign(url);
      });
      choix.append(b);
    }
    return choix;
  }

  // ---------- Factures envoyées ----------
  const STATUTS = {
    draft: { nom: 'Brouillon', couleur: '#94a3b8' },
    sent: { nom: 'Envoyée', couleur: '#2f7de1' },
    received: { nom: 'Reçue', couleur: '#7c5cff' },
    paid: { nom: 'Payée', couleur: '#16a34a' },
  };
  const API_FACTURES = 'https://chronos-api.tiime-apps.com/v1/invoice/companies/';
  let facCle = null;
  let facDonnees = null;
  let facMinuteur = null;
  let facAnnee = CONFIG.anneeFactures ? String(new Date().getFullYear()) : 'tout';
  const dateFr = (iso) => iso ? iso.split('-').reverse().join('/') : '';

  // Même logique que le filtre « Statut » de Tiime (status + statut de facturation électronique)
  function statutFacture(f) {
    if (f.status === 'draft' || f.status === 'paid') return f.status;
    return String(f.status_pa) === '203' ? 'received' : 'sent';
  }
  function enRetard(f) {
    return f.status !== 'paid' && f.status !== 'draft' && f.due_date && f.due_date < new Date().toISOString().slice(0, 10);
  }

  // Lien qui ajoute un filtre, ou le retire s'il est déjà actif
  function urlFiltre(param, valeur) {
    const url = new URL(location.href);
    const actif = url.searchParams.get(param) === String(valeur);
    url.searchParams.set('page', '1');
    if (actif) url.searchParams.delete(param);
    else url.searchParams.set(param, valeur);
    return { url, actif };
  }

  async function chargerFactures(cle) {
    const societe = societeCourante();
    const p = new URLSearchParams(location.search);
    p.delete('page');
    try {
      const r = await fetch(API_FACTURES + societe + '/invoices?' + p, {
        headers: { ...enTetes('application/json'), Range: 'items=0-4999' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const liste = await r.json();
      if (cle !== facCle) return;
      const parId = new Map();
      for (const f of liste) parId.set(String(f.id), f);
      const annees = [...new Set(liste.map((f) => f.emission_date?.slice(0, 4)).filter(Boolean))].sort().reverse();
      facDonnees = { n: liste.length, liste, parId, annees };
    } catch (e) {
      console.warn('[Tiime UI] factures non chargées', e);
      if (cle === facCle) facDonnees = { erreur: true, parId: new Map() };
    }
    planifier();
  }

  function pastille(nom, couleur, valeur, titre, lien) {
    const c = document.createElement(lien ? 'a' : 'span');
    c.className = 'tui-label' + (lien ? '' : ' tui-fixe');
    if (lien) {
      c.href = lien.url.href;
      c.toggleAttribute('data-actif', lien.actif);
      c.addEventListener('click', () => retenirSansDate(lien.url));
    }
    c.style.setProperty('--c', couleur);
    c.title = titre;
    const point = document.createElement('span');
    point.className = 'tui-point';
    const n = document.createElement('span');
    n.textContent = nom;
    const m = document.createElement('span');
    m.className = 'tui-solde';
    c.append(point, n, montant(m, valeur));
    return c;
  }

  // Totaux d'une année, à partir de la date d'émission de chaque facture (montants HT)
  function totauxFactures(liste) {
    const t = {
      facture: { total: 0, ttc: 0, n: 0 },
      encaisse: { total: 0, n: 0 },
      envoye: { total: 0, n: 0, statuts: new Set() },
      retard: { total: 0, n: 0 },
      brouillon: { total: 0, n: 0 },
      clients: new Map(),
    };
    for (const f of liste) {
      const ht = f.total_excluding_taxes || 0;
      const st = statutFacture(f);
      if (st === 'draft') {
        t.brouillon.total += ht;
        t.brouillon.n += 1;
        continue;
      }
      t.facture.total += ht;
      t.facture.ttc += f.total_including_taxes || 0;
      t.facture.n += 1;
      if (st === 'paid') {
        t.encaisse.total += ht;
        t.encaisse.n += 1;
      } else {
        t.envoye.total += ht;
        t.envoye.n += 1;
        t.envoye.statuts.add(st);
        if (enRetard(f)) { t.retard.total += ht; t.retard.n += 1; }
      }
      const c = t.clients.get(f.client_id) || { id: f.client_id, nom: f.client_name || 'Sans client', couleur: f.color || '#cbd5e1', total: 0, n: 0 };
      c.total += ht;
      c.n += 1;
      t.clients.set(f.client_id, c);
    }
    return t;
  }

  const nFac = (n) => `${n} facture${n > 1 ? 's' : ''}`;

  function dessinerRecapFactures(recap) {
    recap.replaceChildren();
    if (!facDonnees) { recap.textContent = 'Calcul en cours…'; return; }
    if (facDonnees.erreur) { recap.textContent = 'Récap indisponible'; return; }
    const d = facDonnees;
    const el = (cls, txt) => { const e = document.createElement('span'); e.className = cls; e.textContent = txt; return e; };

    // Choix de l'année : ne recharge rien, refait seulement le calcul
    const annees = d.annees.includes(facAnnee) || facAnnee === 'tout' ? d.annees : [facAnnee, ...d.annees];
    const choix = el('tui-annees', '');
    for (const a of [...annees, 'tout']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a === 'tout' ? 'Tout' : a;
      b.toggleAttribute('data-actif', a === facAnnee);
      b.addEventListener('click', () => {
        facAnnee = a;
        recap.dataset.cle = '';
        planifier();
      });
      choix.append(b);
    }
    recap.append(choix, el('tui-ligne', ''));

    const liste = facAnnee === 'tout' ? d.liste : d.liste.filter((f) => f.emission_date?.startsWith(facAnnee));
    const t = totauxFactures(liste);
    const periode = facAnnee === 'tout' ? 'toutes années' : `émises en ${facAnnee}`;

    recap.append(pastille('Facturé', '#0f172a', t.facture.total,
      `${nFac(t.facture.n)} ${periode}, hors brouillons · ${euros.format(t.facture.ttc)} TTC`, null));
    recap.append(pastille('Encaissé', STATUTS.paid.couleur, t.encaisse.total,
      `${nFac(t.encaisse.n)} payée${t.encaisse.n > 1 ? 's' : ''} · montant HT`, urlFiltre('merged_status', 'paid')));
    // « Envoyé » regroupe Envoyée et Reçue : Tiime ne filtre que sur un statut à la fois
    const envoyeStatut = t.envoye.statuts.size === 1 ? [...t.envoye.statuts][0] : null;
    recap.append(pastille('Envoyé', STATUTS.sent.couleur, t.envoye.total,
      `${nFac(t.envoye.n)} en attente de paiement · montant HT`, envoyeStatut ? urlFiltre('merged_status', envoyeStatut) : null));
    if (t.retard.n) {
      recap.append(pastille('dont en retard', '#dc2626', t.retard.total,
        `${nFac(t.retard.n)} non payée${t.retard.n > 1 ? 's' : ''} après l'échéance · montant HT`, null));
    }
    recap.append(pastille('Brouillon', STATUTS.draft.couleur, t.brouillon.total,
      `${nFac(t.brouillon.n)} pas encore envoyée${t.brouillon.n > 1 ? 's' : ''} · montant HT`, urlFiltre('merged_status', 'draft')));

    const clients = [...t.clients.values()].sort((a, b) => b.total - a.total);
    if (clients.length) {
      recap.append(el('tui-ligne', ''), el('tui-groupe', 'Clients'));
      for (const c of clients) {
        recap.append(pastille(c.nom, c.couleur, c.total, `${nFac(c.n)} ${periode} · facturé HT`, c.id ? urlFiltre('client', c.id) : null));
      }
    }
  }

  function traiterFacture(row, precedente) {
    const id = row.getAttribute('data-cy')?.match(/invoice-list-item-(\d+)/)?.[1];
    const f = id && facDonnees?.parId?.get(id);
    if (!f) return null;
    const annee = f.emission_date?.slice(0, 4) || '';
    const cellDate = row.querySelector(':scope > tds-cell:first-child .tds-cell-projected-content');
    if (cellDate && cellDate.getAttribute('data-tui-annee') !== annee) cellDate.setAttribute('data-tui-annee', annee);
    row.toggleAttribute('data-tui-coupure', !!precedente && precedente !== annee);
    row.setAttribute('data-tui-statut', statutFacture(f));
    row.toggleAttribute('data-tui-retard', !!enRetard(f));
    const infos = [`Émise le ${dateFr(f.emission_date)}`];
    if (f.due_date) infos.push(`échéance ${dateFr(f.due_date)}`);
    const paiement = f.bank_transactions?.[0]?.transaction_date;
    if (f.status === 'paid' && paiement) infos.push(`payée le ${dateFr(paiement)}`);
    if (enRetard(f)) infos.push('EN RETARD');
    row.title = infos.join(' · ');
    return annee;
  }

  function factures() {
    const surFactures = PAGE_FACTURES.test(location.pathname);
    if (surFactures) document.documentElement.dataset.tuiPage = 'factures';
    else if (document.documentElement.dataset.tuiPage === 'factures') delete document.documentElement.dataset.tuiPage;
    if (!surFactures) return;
    const bar = document.querySelector('app-boxed-action-bar');
    if (!bar) return;
    let recap = document.getElementById('tui-recap-factures');
    if (!recap || bar.nextElementSibling !== recap) {
      recap?.remove();
      recap = document.createElement('div');
      recap.id = 'tui-recap-factures';
      recap.className = 'tui-recap';
      recap.dataset.cle = '';
      bar.after(recap);
    }
    const cle = cleFiltres();
    if (cle !== facCle) {
      facCle = cle;
      facDonnees = null;
      clearTimeout(facMinuteur);
      facMinuteur = setTimeout(() => chargerFactures(cle), 300);
    }
    const etat = facDonnees ? (facDonnees.erreur ? 'erreur' : cle + '#' + facDonnees.n + '#' + facAnnee) : 'calcul';
    if (recap.dataset.cle !== etat) {
      recap.dataset.cle = etat;
      dessinerRecapFactures(recap);
    }
    let precedente = null;
    document.querySelectorAll(LIGNE_FACTURE).forEach((row) => {
      precedente = traiterFacture(row, precedente) ?? precedente;
    });
  }

  // ---------- Fenêtre « Relier » ----------
  // Dernier montant en euros d'un texte (« 1 327,62 € »), sans confondre avec une date juste avant
  const nombre = (txt) => {
    const m = (txt || '').match(/(?<![\d\/,])-?\d{1,3}(?:[\s\u00a0\u202f]\d{3})*,\d{2}(?=[\s\u00a0\u202f]*€)/g);
    return m ? Math.abs(parseFloat(m[m.length - 1].replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'))) : null;
  };

  function relier() {
    const dlg = document.querySelector(R);
    if (!dlg) return;
    // Montant du document ou de la transaction à relier, affiché en haut de la fenêtre
    const cible = nombre(dlg.querySelector('app-matching-dialog-header')?.textContent);
    dlg.querySelectorAll('tds-body-row').forEach((row) => {
      const el = row.querySelector('.amount, app-documents-amount-column-content, [class*="amount-column-content"]');
      const v = el ? nombre(el.textContent + '€') : null;
      let match = '';
      if (cible && v) {
        const ecart = Math.abs(v - cible);
        if (ecart < 0.005) match = 'exact';
        else if (ecart / cible <= 0.10) match = 'proche';
      }
      if ((row.getAttribute('data-tui-match') || '') !== match) {
        if (match) row.setAttribute('data-tui-match', match);
        else row.removeAttribute('data-tui-match');
        row.title = match === 'exact' ? 'Même montant que le document' : match === 'proche' ? 'Montant proche du document (moins de 10 % d\'écart)' : '';
      }
    });
  }

  // ---------- Factures reçues ----------
  const MOIS = { 'janv.': 1, 'févr.': 2, mars: 3, 'avr.': 4, mai: 5, juin: 6, 'juil.': 7, 'août': 8, 'sept.': 9, 'oct.': 10, 'nov.': 11, 'déc.': 12 };

  function facturesRecues() {
    const page = document.querySelector(FR);
    if (!page) return;
    // Boutons d'année sous la recherche
    const bar = page.querySelector('app-boxed-action-bar');
    if (bar) {
      let recap = document.getElementById('tui-recap-recues');
      if (!recap || bar.nextElementSibling !== recap) {
        recap?.remove();
        recap = document.createElement('div');
        recap.id = 'tui-recap-recues';
        recap.className = 'tui-recap';
        bar.after(recap);
      }
      if (recap.dataset.cle !== location.search) {
        recap.dataset.cle = location.search;
        recap.replaceChildren(boutonsAnnees(false));
      }
    }
    const anneeCourante = String(new Date().getFullYear());
    let precedente = null;
    page.querySelectorAll('tds-body-row').forEach((row) => {
      // Tag identique au label
      const tags = row.querySelector('app-tags-list');
      if (tags) {
        const t = [...tags.querySelectorAll('tiime-chip')].map((c) => norm(c.textContent)).sort().join('|');
        const l = [...row.querySelectorAll('app-label-chip')].map((c) => norm(c.textContent)).sort().join('|');
        tags.toggleAttribute('data-tui-dup', CONFIG.masquerTagsDoublons && t !== '' && t === l);
      }
      // Pas encore reliée à une transaction : Tiime affiche alors le bouton « Relier »
      row.toggleAttribute('data-tui-arelier', !!row.querySelector('button[tds-icon-button="icon-link-filled"]'));
      // Année de la date : Tiime ne l'écrit, sur une seconde ligne, que pour les autres années
      const label = row.querySelector(':scope > :nth-child(2) .tiime-date-list-cell-label');
      if (!label) return;
      const annee = row.querySelector(':scope > :nth-child(2) .tiime-date-list-cell-year')?.textContent.trim() || anneeCourante;
      row.toggleAttribute('data-tui-coupure', precedente !== null && precedente !== annee);
      precedente = annee;
      if (label.getAttribute('data-tui-annee') !== annee) label.setAttribute('data-tui-annee', annee);
    });
  }

  // ---------- Notes de frais ----------
  const API_NDF = (societe) => API + societe + '/expense_reports?';
  let ndfCle = null;
  let ndfDonnees = null;
  let ndfMinuteur = null;
  const valeurMeta = (x, k) => x.metadata?.find((m) => m.key === k)?.value;
  const montantMeta = (x, k) => valeurMeta(x, k)?.value ?? 0;

  // Même logique que le badge de Tiime : Brouillon, Payée, sinon à rembourser
  function statutNote(n) {
    if (n.lifecycle_status === 'draft') return 'brouillon';
    return n.payment_status === 'paid' ? 'payee' : 'arembourser';
  }

  async function chargerNotes(cle) {
    const p = new URLSearchParams(location.search);
    p.delete('page');
    // L'adresse de la page dit « sort », l'API attend « sorts »
    if (p.has('sort')) { p.set('sorts', p.get('sort')); p.delete('sort'); }
    try {
      const r = await fetch(API_NDF(societeCourante()) + p, {
        headers: { ...enTetes('application/json'), Range: 'items=0-4999' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (cle !== ndfCle) return;
      const liste = j.expense_reports || [];
      const parNom = new Map();
      for (const n of liste) {
        const k = norm(n.name) + '|' + cents(montantMeta(n, 'amount'));
        parNom.set(k, [...(parNom.get(k) || []), n]);
      }
      ndfDonnees = { liste, parNom };
    } catch (e) {
      console.warn('[Tiime UI] notes de frais non chargées', e);
      if (cle === ndfCle) ndfDonnees = { erreur: true };
    }
    planifier();
  }

  function dessinerRecapNotes(recap) {
    const el = (cls, txt) => { const e = document.createElement('span'); e.className = cls; e.textContent = txt; return e; };
    recap.replaceChildren(boutonsAnnees(false), el('tui-ligne', ''));
    if (!ndfDonnees) { recap.append('Calcul en cours…'); return; }
    if (ndfDonnees.erreur) { recap.append('Récap indisponible'); return; }
    const nNote = (n) => `${n} note${n > 1 ? 's' : ''}`;
    const t = { total: [0, 0, 0], payee: [0, 0], arembourser: [0, 0], brouillon: [0, 0], frais: [0, 0], km: [0, 0, 0] };
    const labels = new Map();
    for (const n of ndfDonnees.liste) {
      const ttc = montantMeta(n, 'amount');
      const st = statutNote(n);
      t[st][0] += ttc; t[st][1] += 1;
      if (st === 'brouillon') continue;
      t.total[0] += ttc; t.total[1] += 1; t.total[2] += montantMeta(n, 'vat_amount');
      if (n.expense_type === 'travel') {
        t.km[0] += ttc; t.km[1] += 1;
        t.km[2] += (n.travels || []).reduce((s, v) => s + (v.distance || 0), 0);
      } else {
        t.frais[0] += ttc; t.frais[1] += 1;
        for (const d of n.advanced_expenses || []) {
          const nom = d.label?.name || 'Sans label';
          const l = labels.get(nom) || { nom, couleur: d.label?.color || '#cbd5e1', total: 0, n: 0 };
          l.total += d.amount || 0;
          l.n += 1;
          labels.set(nom, l);
        }
      }
    }
    // Montants des notes en dépenses : affichés en positif, ce que l'entreprise te doit ou t'a versé
    recap.append(pastille('Total', '#0f172a', t.total[0],
      `${nNote(t.total[1])} hors brouillons · TTC · dont ${euros.format(t.total[2])} de TVA, HT ${euros.format(t.total[0] - t.total[2])}`, null));
    recap.append(pastille('Remboursé', STATUTS.paid.couleur, t.payee[0], `${nNote(t.payee[1])} payée${t.payee[1] > 1 ? 's' : ''} · TTC`, null));
    if (t.arembourser[1]) {
      recap.append(pastille('À rembourser', '#f59e0b', t.arembourser[0], `${nNote(t.arembourser[1])} enregistrée${t.arembourser[1] > 1 ? 's' : ''}, pas encore payée${t.arembourser[1] > 1 ? 's' : ''} · TTC`, null));
    }
    if (t.brouillon[1]) {
      recap.append(pastille('Brouillon', STATUTS.draft.couleur, t.brouillon[0], `${nNote(t.brouillon[1])} pas encore enregistrée${t.brouillon[1] > 1 ? 's' : ''} · TTC`, null));
    }
    recap.append(el('tui-ligne', ''), el('tui-groupe', 'Type'));
    recap.append(pastille('Frais avancés', '#eab308', t.frais[0], `${nNote(t.frais[1])} · TTC`, null));
    recap.append(pastille(`Kilométriques${t.km[2] ? ' · ' + Math.round(t.km[2]).toLocaleString('fr-FR') + ' km' : ''}`, '#38bdf8', t.km[0], `${nNote(t.km[1])} · TTC`, null));
    const ls = [...labels.values()].sort((a, b) => b.total - a.total);
    if (ls.length) {
      recap.append(el('tui-ligne', ''), el('tui-groupe', 'Labels'));
      for (const l of ls) recap.append(pastille(l.nom, l.couleur, l.total, `${l.n} dépense${l.n > 1 ? 's' : ''} · TTC, hors brouillons`, null));
    }
  }

  function noteDeLigne(row) {
    const nom = row.querySelector('app-documents-name-column-content .name')?.textContent;
    const txt = row.querySelector('app-documents-amount-column-content')?.textContent || '';
    const v = parseFloat(txt.replace(/[^\d,-]/g, '').replace(',', '.'));
    if (!nom || !Number.isFinite(v)) return null;
    const c = ndfDonnees?.parNom?.get(norm(nom) + '|' + cents(v)) || [];
    return c.length === 1 ? c[0] : null;
  }

  function detailNote(n) {
    const morceaux = [];
    const titre = [];
    if (n.expense_type === 'travel') {
      const tr = n.travels || [];
      const km = tr.reduce((s, v) => s + (v.distance || 0), 0);
      morceaux.push(`${tr.length} trajet${tr.length > 1 ? 's' : ''} · ${Math.round(km).toLocaleString('fr-FR')} km`);
    } else {
      const d = n.advanced_expenses || [];
      morceaux.push(`${d.length} dépense${d.length > 1 ? 's' : ''}`);
      const parLabel = new Map();
      for (const x of d) {
        const nom = x.label?.name || 'Sans label';
        parLabel.set(nom, (parLabel.get(nom) || 0) + (x.amount || 0));
      }
      for (const [nom, v] of [...parLabel].sort((a, b) => b[1] - a[1])) titre.push(`${nom} : ${euros.format(v)}`);
    }
    const paiement = n.linked_entities?.find((e) => e.type === 'imputation' || e.type === 'bank_transaction')?.value?.date;
    if (statutNote(n) === 'payee' && paiement) morceaux.push(`remboursée le ${dateFr(paiement.slice(0, 10))}`);
    return { texte: morceaux.join(' · '), titre: titre.join('\n') };
  }

  function notesDeFrais() {
    const page = document.querySelector(NF);
    document.documentElement.toggleAttribute('data-tui-sans-proprio', !!page && CONFIG.masquerProprietaire);
    if (!page) return;
    const bar = page.querySelector('app-boxed-action-bar');
    if (bar) {
      let recap = document.getElementById('tui-recap-ndf');
      if (!recap || bar.nextElementSibling !== recap) {
        recap?.remove();
        recap = document.createElement('div');
        recap.id = 'tui-recap-ndf';
        recap.className = 'tui-recap';
        recap.dataset.cle = '';
        bar.after(recap);
      }
      const cle = cleFiltres();
      if (cle !== ndfCle) {
        ndfCle = cle;
        ndfDonnees = null;
        clearTimeout(ndfMinuteur);
        ndfMinuteur = setTimeout(() => chargerNotes(cle), 300);
      }
      const etat = ndfDonnees ? (ndfDonnees.erreur ? 'erreur' : cle + '#' + ndfDonnees.liste.length) : 'calcul';
      if (recap.dataset.cle !== etat) {
        recap.dataset.cle = etat;
        dessinerRecapNotes(recap);
      }
    }
    const anneeCourante = String(new Date().getFullYear());
    let precedente = null;
    page.querySelectorAll('tds-body-row').forEach((row) => {
      // Année des deux dates (note et échéance), à droite au lieu d'une seconde ligne
      for (const col of [2, 7]) {
        const label = row.querySelector(`:scope > :nth-child(${col}) .tiime-date-list-cell-label`);
        if (!label) continue;
        const annee = row.querySelector(`:scope > :nth-child(${col}) .tiime-date-list-cell-year`)?.textContent.trim() || anneeCourante;
        if (col === 2) {
          row.toggleAttribute('data-tui-coupure', precedente !== null && precedente !== annee);
          precedente = annee;
        }
        if (label.getAttribute('data-tui-annee') !== annee) label.setAttribute('data-tui-annee', annee);
      }
      const n = noteDeLigne(row);
      row.toggleAttribute('data-tui-arembourser', !!n && statutNote(n) === 'arembourser');
      row.toggleAttribute('data-tui-brouillon', !!n && statutNote(n) === 'brouillon');
      const haut = row.querySelector('app-documents-name-column-content .document-text__up');
      if (!haut) return;
      let detail = haut.querySelector(':scope > .tui-detail');
      const d = n ? detailNote(n) : null;
      if (!d) { detail?.remove(); return; }
      if (!detail) {
        detail = document.createElement('span');
        detail.className = 'tui-detail';
        haut.append(detail);
      }
      if (detail.textContent !== d.texte) detail.textContent = d.texte;
      if (detail.title !== d.titre) detail.title = d.titre;
    });
  }

  // ---------- Copier / coller une répartition (Transactions) ----------
  // Seule fonction qui écrit dans Tiime : uniquement au clic sur « Coller », après confirmation
  const PRESSE = 'tui-repartition';
  let presse = null;
  try { presse = JSON.parse(sessionStorage.getItem(PRESSE) || 'null'); } catch (e) { /* stockage indisponible */ }
  const cents = (v) => Math.round((v || 0) * 100);
  let index = null;
  let indexSource = null;

  // Date d'une ligne (« 03 nov. », plus l'année si Tiime l'affiche) au format de l'API
  function dateLigne(row) {
    const cell = row.querySelector(':scope > :nth-child(3)');
    const [j, m] = (cell?.querySelector('.tiime-date-list-cell-label')?.textContent || '').trim().split(/\s+/);
    if (!MOIS[m] || !j) return null;
    const an = cell.querySelector('.tiime-date-list-cell-year')?.textContent.trim() || new Date().getFullYear();
    return `${an}-${String(MOIS[m]).padStart(2, '0')}-${j.padStart(2, '0')}`;
  }
  function montantLigne(row) {
    const txt = row.querySelector('.amount')?.textContent || '';
    const v = parseFloat(txt.replace(/[^\d,-]/g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  }
  // Retrouve la transaction d'une ligne dans la liste du récap (même date et même montant)
  function transactionDeLigne(row) {
    const liste = recapDonnees?.liste;
    if (!liste) return null;
    if (indexSource !== liste) {
      index = new Map();
      for (const t of liste) {
        const k = (t.transaction_date || t.realization_date) + '|' + cents(t.amount);
        index.set(k, [...(index.get(k) || []), t]);
      }
      indexSource = liste;
    }
    const d = dateLigne(row);
    const a = montantLigne(row);
    if (!d || a === null) return null;
    let c = index.get(d + '|' + cents(a)) || [];
    if (c.length > 1) {
      const w = norm(row.querySelector('.wording-cell')?.textContent);
      c = c.filter((t) => w.includes(norm(t.wording || t.original_wording)));
    }
    return c.length === 1 ? c[0] : null;
  }
  const signature = (lignes) => lignes.map((l) => (l.label?.id || 0) + ':' + cents(l.amount)).join(',');

  function copier(t) {
    if (presse?.source.id === t.id) {
      presse = null;
    } else {
      presse = {
        source: { id: t.id, date: t.transaction_date, nom: t.wording || t.original_wording || '' },
        total: t.amount,
        lignes: t.imputations.map((i) => ({
          label: i.label ? { id: i.label.id, name: i.label.name, color: i.label.color } : null,
          amount: i.amount,
          comment: i.comment ?? null,
        })),
      };
    }
    try {
      if (presse) sessionStorage.setItem(PRESSE, JSON.stringify(presse));
      else sessionStorage.removeItem(PRESSE);
    } catch (e) { /* stockage indisponible */ }
    planifier();
  }

  async function coller(t, bouton) {
    const p = presse;
    const resume = p.lignes.map((l) => `• ${l.label?.name || 'Sans label'} : ${euros.format(l.amount)}`).join('\n');
    const nom = t.wording || t.original_wording || '';
    if (!confirm(`Remplacer la répartition de « ${nom} » du ${dateFr(t.transaction_date)} (${euros.format(t.amount)}) par :\n\n${resume}`)) return;
    bouton.disabled = true;
    bouton.textContent = '…';
    const url = API + societeCourante() + '/bank_transactions/' + t.id;
    try {
      // Relit la transaction juste avant, avec les justificatifs de chaque sous-ligne
      const r0 = await fetch(url, { headers: enTetes('application/vnd.tiime.docs.imputation+json') });
      if (!r0.ok) throw new Error('lecture impossible (HTTP ' + r0.status + ')');
      const actuelle = await r0.json();
      if (cents(actuelle.amount) !== cents(p.total)) throw new Error('le montant de la transaction ne correspond pas');
      const somme = p.lignes.reduce((s, l) => s + cents(l.amount), 0);
      if (somme !== cents(actuelle.amount)) throw new Error('la somme des sous-lignes ne fait pas le montant');
      const imps = actuelle.imputations || [];
      if (imps.some((i) => i.count_documents || i.count_invoices || i.documents?.length || i.invoices?.length)) {
        throw new Error('une sous-ligne a déjà un justificatif relié, fais la répartition dans Tiime');
      }
      // Même envoi que la fenêtre de ventilation de Tiime : les premières sous-lignes gardent leur identifiant
      const imputations = p.lignes.map((l, k) => {
        const o = { label: l.label ? { id: l.label.id } : null, amount: l.amount };
        if (l.comment) o.comment = l.comment;
        if (imps[k]?.id) o.id = imps[k].id;
        return o;
      });
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { ...enTetes('application/json'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ imputations }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      // Tiime ne rafraîchit pas la ligne de lui-même : on lui fait relire la liste
      await rafraichirListe();
    } catch (e) {
      console.warn('[Tiime UI] répartition non collée', e);
      alert('Répartition non collée : ' + e.message);
      bouton.disabled = false;
      bouton.textContent = 'Coller';
    }
  }

  // Fait relire la liste à Tiime sans recharger la page : on sort de Transactions puis on y revient
  // dans l'appli. Tiime recrée la page et relit les filtres de l'adresse, la position est gardée.
  let rafraichissement = false;
  const attendre = async (cond, max) => {
    const fin = performance.now() + max;
    while (!cond()) {
      if (performance.now() > fin) return false;
      await new Promise((r) => setTimeout(r, 30));
    }
    return true;
  };
  const defilant = (el) => {
    for (let e = el?.parentElement; e; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e;
    }
    return document.scrollingElement;
  };
  async function rafraichirListe() {
    const avant = document.querySelector(T);
    const ici = location.href;
    const position = defilant(avant?.querySelector('tds-body-row')).scrollTop;
    const aller = (u) => {
      history.replaceState(history.state, '', u);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    };
    rafraichissement = true;
    document.documentElement.setAttribute('data-tui-rafraichir', '');
    try {
      aller(location.pathname.replace(/\/transactions\/?$/, '/tui-rafraichir'));
      if (!(await attendre(() => !document.contains(avant), 3000))) throw new Error('page non quittée');
      aller(ici);
      const nouvelle = () => { const t = document.querySelector(T); return t && t !== avant ? t : null; };
      if (!(await attendre(() => nouvelle()?.querySelector('tds-body-row .amount'), 8000))) throw new Error('page non revenue');
      defilant(nouvelle().querySelector('tds-body-row')).scrollTop = position;
    } catch (e) {
      console.warn('[Tiime UI] rafraîchissement sans rechargement impossible', e);
      rafraichissement = false;
      document.documentElement.removeAttribute('data-tui-rafraichir');
      location.replace(ici);
      return;
    }
    dernierChemin = location.pathname;
    rafraichissement = false;
    document.documentElement.removeAttribute('data-tui-rafraichir');
    recapCle = null; // recalcule le récap, qui sert aussi à retrouver les lignes
    planifier();
  }

  function boutonsRepartition(row) {
    if (row.querySelector('app-imputation-row')) return; // sous-ligne d'une ventilation
    const cell = row.querySelector(':scope > :last-child .tds-cell-projected-content');
    if (!cell) return;
    const t = transactionDeLigne(row);
    const peutCopier = !!t?.imputations?.some((i) => i.label);
    const estSource = !!t && presse?.source.id === t.id;
    let coller_ = '';
    if (t && presse && !estSource && cents(t.amount) === cents(presse.total)) {
      coller_ = signature(t.imputations || []) === signature(presse.lignes) ? 'identique' : 'oui';
    }
    const etat = t ? [t.id, peutCopier, estSource, coller_].join('|') : '';
    let zone = cell.querySelector(':scope > .tui-rep');
    if ((zone?.dataset.etat || '') === etat && (zone || !etat)) return;
    zone?.remove();
    if (!etat || (!peutCopier && !coller_)) return;
    zone = document.createElement('span');
    zone.className = 'tui-rep';
    zone.dataset.etat = etat;
    if (coller_) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tui-coller';
      b.textContent = coller_ === 'identique' ? 'Identique' : 'Coller';
      b.disabled = coller_ === 'identique';
      b.title = coller_ === 'identique' ? 'Cette ligne a déjà la répartition copiée' : 'Appliquer la répartition copiée à cette ligne';
      b.addEventListener('click', (e) => { e.stopPropagation(); coller(t, b); });
      zone.append(b);
    }
    if (peutCopier) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tui-copier';
      b.textContent = estSource ? 'Copiée' : 'Copier';
      b.toggleAttribute('data-actif', estSource);
      b.title = estSource ? 'Cliquer pour oublier cette répartition' : 'Copier la répartition (labels et montants) de cette ligne';
      b.addEventListener('click', (e) => { e.stopPropagation(); copier(t); });
      zone.append(b);
    }
    cell.prepend(zone);
  }

  // Bandeau en bas de l'écran : ce qui est copié
  function bandeauPresse() {
    let bandeau = document.getElementById('tui-presse');
    const visible = presse && document.querySelector(T);
    if (!visible) { bandeau?.remove(); return; }
    const cle = JSON.stringify(presse);
    if (bandeau?.dataset.cle === cle) return;
    if (!bandeau) {
      bandeau = document.createElement('div');
      bandeau.id = 'tui-presse';
      document.body.append(bandeau);
    }
    bandeau.dataset.cle = cle;
    bandeau.replaceChildren();
    const tete = document.createElement('span');
    tete.innerHTML = 'Répartition copiée : <b></b>';
    tete.querySelector('b').textContent = `${presse.source.nom} du ${dateFr(presse.source.date)}`;
    bandeau.append(tete);
    for (const l of presse.lignes) {
      const e = document.createElement('span');
      e.className = 'tui-l';
      e.innerHTML = '<span class="tui-point"></span><span></span><span class="tui-m"></span>';
      e.firstChild.style.setProperty('--c', l.label?.color || '#cbd5e1');
      e.children[1].textContent = l.label?.name || 'Sans label';
      e.children[2].textContent = euros.format(l.amount);
      bandeau.append(e);
    }
    const vider = document.createElement('button');
    vider.type = 'button';
    vider.textContent = 'Vider';
    vider.addEventListener('click', () => {
      presse = null;
      try { sessionStorage.removeItem(PRESSE); } catch (e) { /* stockage indisponible */ }
      planifier();
    });
    bandeau.append(vider);
  }

  // Arrivée sur Transactions depuis une autre page de l'appli : on ajoute aussi la date
  let dernierChemin = location.pathname;
  function verifierEntree() {
    if (location.pathname === dernierChemin) return false;
    if (rafraichissement) {
      dernierChemin = location.pathname;
      return false;
    }
    const venaitDeTransactions = PAGE_TRANSACTIONS.test(dernierChemin);
    dernierChemin = location.pathname;
    if (venaitDeTransactions) return false;
    const url = urlAvecDateParDefaut();
    if (url) {
      location.replace(url);
      return true;
    }
    return false;
  }

  let planifie = false;
  function planifier() {
    if (!planifie) {
      planifie = true;
      requestAnimationFrame(toutTraiter);
    }
  }
  function toutTraiter() {
    planifie = false;
    if (verifierEntree()) return;
    document.querySelectorAll(`${TL} tds-body-row`).forEach(traiterLigne);
    document.querySelectorAll(`${T} tds-body-row`).forEach(boutonsRepartition);
    bandeauPresse();
    relier();
    facturesRecues();
    notesDeFrais();
    barreComptes();
    factures();
  }
  const obs = new MutationObserver((mutations) => {
    // Ignore nos propres modifications dans la barre des comptes
    const ZONES = '#tui-comptes, .tui-recap, .tui-rep, #tui-presse, .tui-detail';
    if (mutations.every((m) => m.target.closest?.(ZONES) || m.target.parentElement?.closest(ZONES))) return;
    planifier();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
