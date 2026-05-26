/**
 * PWA install-hint op sensecorner.html alleen.
 * Tik op de knop opent instructies (iOS) of native install (Android).
 */
(function () {
  'use strict';

  const INSTALL_BUTTON_ID = 'sc-install-btn';
  const MODAL_ID = 'sc-install-modal';

  let deferredPrompt = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  function isInstalled() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  function detectOS() {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) && !window.MSStream) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'other';
  }

  function isMobileContext() {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod|android/i.test(ua) && !window.MSStream) return true;
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  function setBtnVisible(btn, visible) {
    if (visible) {
      btn.classList.remove('sc-install-btn--off', 'sc-install-btn--pending');
      btn.style.display = 'inline-flex';
    } else {
      btn.classList.add('sc-install-btn--off');
      btn.style.display = 'none';
    }
  }

  function showInstallModal(kind) {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = buildInstallModal(kind);
      document.body.appendChild(modal);
    } else {
      const fresh = buildInstallModal(kind);
      modal.innerHTML = fresh.innerHTML;
      modal.querySelectorAll('[data-close]').forEach((el) => {
        el.addEventListener('click', () => {
          modal.style.display = 'none';
        });
      });
    }
    modal.style.display = 'flex';
  }

  function buildInstallModal(kind) {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sc-install-title');
    const steps =
      kind === 'android'
        ? `
          <li>Tik op het <strong>menu</strong> (⋮) rechtsboven in Chrome.</li>
          <li>Kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.</li>
          <li>Bevestig met <strong>Installeren</strong>.</li>
        `
        : `
          <li>Tik op het <strong>deel-icoon</strong> <span aria-hidden="true">⎙</span> onderaan in Safari.</li>
          <li>Scroll naar beneden en kies <strong>Zet op beginscherm</strong>.</li>
          <li>Tik rechtsboven op <strong>Voeg toe</strong>.</li>
        `;
    modal.innerHTML = `
      <div class="sc-install-modal__overlay" data-close></div>
      <div class="sc-install-modal__panel">
        <h2 id="sc-install-title" class="sc-install-modal__title">SenseCorner op je telefoon</h2>
        <p class="sc-install-modal__intro">In drie tikken klaar:</p>
        <ol class="sc-install-modal__steps">${steps}</ol>
        <button type="button" class="sc-install-modal__close" data-close>Sluiten</button>
      </div>
    `;
    modal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    });
    return modal;
  }

  function init() {
    const btn = document.getElementById(INSTALL_BUTTON_ID);
    if (!btn) return;

    if (isInstalled() || !isMobileContext()) {
      setBtnVisible(btn, false);
      return;
    }

    const os = detectOS();

    if (os === 'ios') {
      setBtnVisible(btn, true);
      btn.addEventListener('click', () => showInstallModal('ios'));
      return;
    }

    if (os === 'android') {
      let promptBound = false;
      setBtnVisible(btn, false);
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        setBtnVisible(btn, true);
        if (!promptBound) {
          promptBound = true;
          btn.addEventListener('click', () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(() => {
              deferredPrompt = null;
            });
          });
        }
      });
      window.setTimeout(() => {
        if (deferredPrompt) return;
        setBtnVisible(btn, true);
        btn.addEventListener('click', () => showInstallModal('android'));
      }, 2000);
      window.addEventListener('appinstalled', () => {
        setBtnVisible(btn, false);
        deferredPrompt = null;
      });
      return;
    }

    setBtnVisible(btn, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
