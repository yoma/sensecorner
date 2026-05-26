/**
 * SenseCorner PWA install-prompt.
 * Hoort op zowel index.html als sensecorner.html geladen te worden.
 * Verwacht een button met id="sc-install-btn" in de DOM.
 */
(function () {
  'use strict';

  document.documentElement.classList.add('sc-pwa-js');

  const INSTALL_BUTTON_ID = 'sc-install-btn';
  const MODAL_ID = 'sc-install-modal';

  let deferredPrompt = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Stil falen: service worker is alleen voor installability
      });
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

  /** Install-knop alleen op telefoon/tablet, niet op desktop-browsers. */
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

  function init() {
    const btn = document.getElementById(INSTALL_BUTTON_ID);
    if (!btn) return;

    if (isInstalled()) {
      setBtnVisible(btn, false);
      return;
    }

    if (!isMobileContext()) {
      setBtnVisible(btn, false);
      return;
    }

    const os = detectOS();

    if (os === 'ios') {
      setBtnVisible(btn, true);
      btn.addEventListener('click', showIosInstructions);
      // iOS heeft geen native install-popup; eenmalig per sessie uitleg tonen
      try {
        if (!sessionStorage.getItem('sc-install-hint-seen')) {
          window.setTimeout(() => {
            if (!isInstalled()) showIosInstructions();
            sessionStorage.setItem('sc-install-hint-seen', '1');
          }, 1200);
        }
      } catch (_e) {
        /* private mode */
      }
    } else if (os === 'android') {
      let promptBound = false;
      setBtnVisible(btn, false);
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        setBtnVisible(btn, true);
        if (!promptBound) {
          promptBound = true;
          btn.addEventListener('click', handleNativeInstall);
        }
      });
      window.setTimeout(() => {
        if (deferredPrompt) return;
        setBtnVisible(btn, true);
        btn.addEventListener('click', showAndroidInstructions);
      }, 2000);
    } else {
      setBtnVisible(btn, false);
    }

    window.addEventListener('appinstalled', () => {
      setBtnVisible(btn, false);
      deferredPrompt = null;
    });
  }

  function handleNativeInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
    });
  }

  function showInstallModal(kind) {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = buildInstallModal(kind);
      document.body.appendChild(modal);
    } else {
      modal.innerHTML = buildInstallModal(kind).innerHTML;
      modal.querySelectorAll('[data-close]').forEach((el) => {
        el.addEventListener('click', () => {
          modal.style.display = 'none';
        });
      });
    }
    modal.style.display = 'flex';
  }

  function showIosInstructions() {
    showInstallModal('ios');
  }

  function showAndroidInstructions() {
    showInstallModal('android');
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
          <li>Kies <strong>"App installeren"</strong> of <strong>"Toevoegen aan startscherm"</strong>.</li>
          <li>Bevestig met <strong>"Installeren"</strong>.</li>
        `
        : `
          <li>Tik op het <strong>deel-icoon</strong> <span aria-hidden="true">⎙</span> onderaan in Safari.</li>
          <li>Scroll naar beneden en kies <strong>"Zet op beginscherm"</strong>.</li>
          <li>Tik rechtsboven op <strong>"Voeg toe"</strong>.</li>
        `;
    modal.innerHTML = `
      <div class="sc-install-modal__overlay" data-close></div>
      <div class="sc-install-modal__panel">
        <h2 id="sc-install-title" class="sc-install-modal__title">SenseCorner op je beginscherm</h2>
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
