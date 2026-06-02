/* ════════════════════════════════════════════════════════════════════════════
   i18n.js — Internationalization helper
   Soporta ES (idioma original) y EN.
   API:
     I18n.t(key, vars?)        → string traducido (con interpolación {name})
     I18n.has(key)             → boolean
     I18n.getLang()            → 'es' | 'en'
     I18n.setLang(lang)        → cambia idioma, persiste, dispara 'i18n:change'
     I18n.apply(root?)         → aplica traducciones a un subárbol DOM
     I18n.ready                → Promise resuelve cuando los diccionarios cargaron
   Atributos DOM soportados:
     data-i18n="key"                → textContent
     data-i18n-html="key"           → innerHTML
     data-i18n-placeholder="key"
     data-i18n-title="key"
     data-i18n-aria-label="key"
     data-i18n-alt="key"
   ════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'goscm.lang';
  const DEFAULT_LANG = 'es';
  const SUPPORTED = ['es', 'en'];

  const dicts = { es: null, en: null };
  let currentLang = DEFAULT_LANG;
  let readyResolve;
  const readyPromise = new Promise(res => { readyResolve = res; });

  function detectInitialLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) { /* localStorage bloqueado */ }
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.startsWith('en')) return 'en';
    return DEFAULT_LANG;
  }

  function persist(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
  }

  function lookup(lang, key) {
    const dict = dicts[lang];
    if (!dict) return undefined;
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    return undefined;
  }

  function interpolate(str, vars) {
    if (!vars || typeof str !== 'string') return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  function t(key, vars) {
    let val = lookup(currentLang, key);
    if (val === undefined) val = lookup('es', key);
    if (val === undefined) val = key;
    return interpolate(val, vars);
  }

  function has(key) {
    return lookup(currentLang, key) !== undefined || lookup('es', key) !== undefined;
  }

  function applyAttr(el, attr, key) {
    if (!key) return;
    el.setAttribute(attr, t(key));
  }

  function apply(root) {
    const scope = root || document;
    // textContent
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    // innerHTML (uso controlado, sólo para keys conocidas con markup)
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => applyAttr(el, 'placeholder', el.getAttribute('data-i18n-placeholder')));
    scope.querySelectorAll('[data-i18n-title]').forEach(el => applyAttr(el, 'title', el.getAttribute('data-i18n-title')));
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => applyAttr(el, 'aria-label', el.getAttribute('data-i18n-aria-label')));
    scope.querySelectorAll('[data-i18n-alt]').forEach(el => applyAttr(el, 'alt', el.getAttribute('data-i18n-alt')));
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    if (lang === currentLang) return;
    currentLang = lang;
    persist(lang);
    document.documentElement.setAttribute('lang', lang);
    apply(document);
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  }

  function getLang() { return currentLang; }

  async function loadDict(lang) {
    if (dicts[lang]) return dicts[lang];
    try {
      const resp = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('fetch failed ' + resp.status);
      dicts[lang] = await resp.json();
    } catch (err) {
      console.error('[i18n] error cargando', lang, err);
      dicts[lang] = {};
    }
    return dicts[lang];
  }

  function refreshToggleUi() {
    document.querySelectorAll('.sidebar-lang .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.setAttribute('aria-pressed', String(lang === currentLang));
    });
  }

  function wireToggle() {
    document.querySelectorAll('.sidebar-lang .lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        setLang(lang);
        refreshToggleUi();
      });
    });
    refreshToggleUi();
  }

  async function init() {
    currentLang = detectInitialLang();
    document.documentElement.setAttribute('lang', currentLang);
    // Carga ambos diccionarios (es como fallback, en para overlay)
    await Promise.all([loadDict('es'), loadDict('en')]);
    apply(document);
    wireToggle();
    readyResolve();
    document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: currentLang } }));
  }

  // Mantener el toggle sincronizado si algo más cambia el idioma
  document.addEventListener('i18n:change', refreshToggleUi);

  // Auto-init en DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.I18n = { t, has, getLang, setLang, apply, ready: readyPromise };
})(window);
