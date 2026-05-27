/**
 * SenseCorner merkteken: rimpel + S (of varianten).
 * Plaatsing: <span data-sc-mark="ripple-s" data-sc-tone="sage" data-sc-size="32"></span>
 * <=32px: automatisch compact (grotere kern + S). data-sc-full="1" forceert PWA-proporties.
 * API: scMarkHtml({ mode, tone, size, pulse, full, className })
 */
(function (global) {
  'use strict';

  var S_PATH =
    'M 668 292 C 520 248 368 268 318 360 C 278 432 318 508 430 536 L 548 568 C 648 594 698 648 678 728 C 648 838 518 878 358 852 C 278 838 238 808 218 768 L 308 728 C 328 768 388 788 468 798 C 568 812 648 778 668 708 C 688 638 628 588 528 562 L 408 528 C 298 498 248 428 268 348 C 308 228 468 178 638 228 C 708 248 748 268 768 292 Z';
  var MONO_CX = 493;
  var MONO_CY = 528;

  var GEO = {
    full: { rL: 400, rM: 357.33, rD: 314.67, rC: 202.67, s: 0.74 },
    compact: { rL: 388, rM: 348, rD: 308, rC: 252, s: 0.92 },
  };

  var TONE_VARS = {
    sage: true,
    date: true,
    family: true,
    friend: true,
    self: true,
  };

  function sTransform(scale) {
    return (
      'translate(512 512) scale(' +
      scale +
      ') translate(-' +
      MONO_CX +
      ' -' +
      MONO_CY +
      ')'
    );
  }

  function pickGeo(mode, size, opts) {
    opts = opts || {};
    if (mode === 'ripple' || mode === 's-only') return null;
    if (opts.full || opts.forceFull) return GEO.full;
    if (opts.compact === true) return GEO.compact;
    if (mode === 'ripple-s' && size <= 32) return GEO.compact;
    return GEO.full;
  }

  function svgRings(geo) {
    if (!geo) return '';
    return (
      '<circle class="sc-mark__ring sc-mark__ring--l" cx="512" cy="512" r="' +
      geo.rL +
      '"/>' +
      '<circle class="sc-mark__ring sc-mark__ring--m" cx="512" cy="512" r="' +
      geo.rM +
      '"/>' +
      '<circle class="sc-mark__ring sc-mark__ring--d" cx="512" cy="512" r="' +
      geo.rD +
      '"/>'
    );
  }

  function svgCore(mode, geo) {
    if (mode === 'ripple' || !geo) return '';
    return '<circle class="sc-mark__core" cx="512" cy="512" r="' + geo.rC + '"/>';
  }

  function svgS(mode, geo) {
    if (mode === 'ripple' || !geo) return '';
    return '<path class="sc-mark__s" transform="' + sTransform(geo.s) + '" d="' + S_PATH + '"/>';
  }

  /** Compact: vult de smalle taille van de S (anders chocolade-gap op klein formaat). */
  function svgSMidBridge(geo) {
    if (geo !== GEO.compact) return '';
    return (
      '<rect class="sc-mark__s sc-mark__s-bridge" x="468" y="504" width="88" height="26" rx="13" transform="rotate(-10 512 517)"/>'
    );
  }

  function scMarkHtml(opts) {
    opts = opts || {};
    var mode = opts.mode || 'ripple-s';
    var tone = opts.tone || 'sage';
    var size = opts.size || 28;
    var pulse = opts.pulse ? ' sc-mark--pulse' : '';
    var extra = opts.className ? ' ' + opts.className : '';
    if (!TONE_VARS[tone]) tone = 'sage';

    var geo = pickGeo(mode, size, opts);
    var compactClass = geo === GEO.compact ? ' sc-mark--compact' : '';

    return (
      '<span class="sc-mark sc-mark--' +
      size +
      ' sc-mark--' +
      tone +
      ' sc-mark--' +
      mode +
      compactClass +
      pulse +
      extra +
      '" aria-hidden="true">' +
      '<svg class="sc-mark__svg" viewBox="0 0 1024 1024" focusable="false">' +
      svgRings(geo) +
      svgCore(mode, geo) +
      svgS(mode, geo) +
      svgSMidBridge(geo) +
      '</svg></span>'
    );
  }

  function readToneFromDoc() {
    var el = document.documentElement;
    var t = el && el.getAttribute('data-sc-tone');
    if (t && TONE_VARS[t]) return t;
    return 'sage';
  }

  function optsFromElement(el) {
    var size = parseInt(el.getAttribute('data-sc-size') || '28', 10);
    return {
      mode: el.getAttribute('data-sc-mark') || 'ripple-s',
      tone: el.getAttribute('data-sc-tone') || readToneFromDoc(),
      size: size,
      pulse: el.hasAttribute('data-sc-pulse'),
      full: el.getAttribute('data-sc-full') === '1',
      compact: el.getAttribute('data-sc-compact') === '1',
    };
  }

  function upgradeDataMarks() {
    document.querySelectorAll('[data-sc-mark]').forEach(function (el) {
      if (el.getAttribute('data-sc-upgraded') === '1') return;
      var o = optsFromElement(el);
      var wrap = document.createElement('div');
      wrap.innerHTML = scMarkHtml(o).trim();
      var mark = wrap.firstChild;
      if (!mark) return;
      el.replaceWith(mark);
      mark.setAttribute('data-sc-upgraded', '1');
    });
  }

  function upgradeSpinners() {
    var tone = readToneFromDoc();
    document
      .querySelectorAll('.photo-loading-spinner, .advice-loading-spinner')
      .forEach(function (el) {
        if (el.getAttribute('data-sc-upgraded') === '1') return;
        var wrap = document.createElement('div');
        wrap.innerHTML = scMarkHtml({
          mode: 'ripple-s',
          tone: tone,
          size: 18,
          pulse: true,
          className: 'sc-mark--in-loader',
        }).trim();
        var mark = wrap.firstChild;
        if (!mark) return;
        el.replaceWith(mark);
      });
  }

  var upgradeTimer;

  function init() {
    upgradeDataMarks();
    upgradeSpinners();
  }

  function scheduleUpgrade() {
    clearTimeout(upgradeTimer);
    upgradeTimer = setTimeout(init, 100);
  }

  global.scMarkHtml = scMarkHtml;
  global.scMarkUpgrade = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function nodeNeedsUpgrade(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.hasAttribute && node.hasAttribute('data-sc-mark')) return true;
    if (node.matches && node.matches('.photo-loading-spinner, .advice-loading-spinner')) return true;
    if (node.querySelector && node.querySelector('[data-sc-mark], .photo-loading-spinner, .advice-loading-spinner')) {
      return true;
    }
    return false;
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        if (!nodes) continue;
        for (var j = 0; j < nodes.length; j++) {
          if (nodeNeedsUpgrade(nodes[j])) {
            scheduleUpgrade();
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})(typeof window !== 'undefined' ? window : this);
