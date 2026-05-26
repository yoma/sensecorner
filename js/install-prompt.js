/**
 * SenseCorner PWA install-prompt.
 * Hoort op zowel index.html als sensecorner.html geladen te worden.
 * Verwacht een button met id="sc-install-btn" in de DOM.
 */
(function () {
  'use strict';

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

  function init() {
    const btn = document.getElementById(INSTALL_BUTTON_ID);
    if (!btn) return;

    if (isInstalled()) {
      btn.style.display = 'none';
      return;
    }

    if (!isMobileContext()) {
      btn.style.display = 'none';
      return;
    }

    const os = detectOS();

    if (os === 'ios') {
      btn.style.display = '';
      btn.addEventListener('click', showIosInstructions);
    } else {
      btn.style.display = 'none';
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        btn.style.display = '';
        btn.addEventListener('click', handleNativeInstall);
      });
    }

    window.addEventListener('appinstalled', () => {
      btn.style.display = 'none';
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

  function showIosInstructions() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = buildIosModal();
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
  }

  function buildIosModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sc-install-title');
    modal.innerHTML = `
      <div class="sc-install-modal__overlay" data-close></div>
      <div class="sc-install-modal__panel">
        <h2 id="sc-install-title" class="sc-install-modal__title">SenseCorner op je beginscherm</h2>
        <p class="sc-install-modal__intro">In drie tikken klaar:</p>
        <ol class="sc-install-modal__steps">
          <li>Tik op het <strong>deel-icoon</strong> <span aria-hidden="true">⎙</span> onderaan in Safari.</li>
          <li>Scroll naar beneden en kies <strong>"Zet op beginscherm"</strong>.</li>
          <li>Tik rechtsboven op <strong>"Voeg toe"</strong>.</li>
        </ol>
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
