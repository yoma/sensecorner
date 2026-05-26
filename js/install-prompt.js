/**
 * PWA install-hint op sensecorner.html alleen.
 * Android: tik opent native install als beschikbaar.
 * iOS: alleen zichtbare pill (geen popup; Safari → deel → Zet op beginscherm).
 */
(function () {
  'use strict';

  const INSTALL_BUTTON_ID = 'sc-install-btn';
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

  function init() {
    const btn = document.getElementById(INSTALL_BUTTON_ID);
    if (!btn) return;

    if (isInstalled() || !isMobileContext()) {
      setBtnVisible(btn, false);
      return;
    }

    const os = detectOS();
    setBtnVisible(btn, true);

    if (os === 'ios') {
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'Safari: deel-knop → Zet op beginscherm';
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
          btn.removeAttribute('aria-disabled');
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
        setBtnVisible(btn, false);
      }, 2500);
    } else {
      setBtnVisible(btn, false);
    }

    window.addEventListener('appinstalled', () => {
      setBtnVisible(btn, false);
      deferredPrompt = null;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
