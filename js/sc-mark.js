/**
 * SenseCorner merkteken: rimpel + S (of varianten).
 * Plaatsing: <span data-sc-mark="ripple-s" data-sc-tone="sage" data-sc-size="28"></span>
 * API: scMarkHtml({ mode, tone, size, pulse, className })
 */
(function (global) {
  'use strict';

  var S_PATH =
    'M 668 292 C 520 248 368 268 318 360 C 278 432 318 508 430 536 L 548 568 C 648 594 698 648 678 728 C 648 838 518 878 358 852 C 278 838 238 808 218 768 L 308 728 C 328 768 388 788 468 798 C 568 812 648 778 668 708 C 688 638 628 588 528 562 L 408 528 C 298 498 248 428 268 348 C 308 228 468 178 638 228 C 708 248 748 268 768 292 Z';
  var S_XFORM = 'translate(512 512) scale(0.74) translate(-493 -528)';

  var TONE_VARS = {
    sage: ['--sage-licht', '--sage-medium', '--sage-donker'],
    date: ['--date-licht', '--date-medium', '--date-donker'],
    family: ['--family-licht', '--family-medium', '--family-donker'],
    friend: ['--friend-licht', '--friend-medium', '--friend-donker'],
    self: ['--self-licht', '--self-medium', '--self-donker'],
  };

  function svgRings(mode) {
    if (mode === 's-only') return '';
    return (
      '<circle class="sc-mark__ring sc-mark__ring--l" cx="512" cy="512" r="400"/>' +
      '<circle class="sc-mark__ring sc-mark__ring--m" cx="512" cy="512" r="357.33"/>' +
      '<circle class="sc-mark__ring sc-mark__ring--d" cx="512" cy="512" r="314.67"/>'
    );
  }

  function svgCore(mode) {
    if (mode === 'ripple') return '';
    return '<circle class="sc-mark__core" cx="512" cy="512" r="202.67"/>';
  }

  function svgS(mode) {
    if (mode === 'ripple') return '';
    return '<path class="sc-mark__s" transform="' + S_XFORM + '" d="' + S_PATH + '"/>';
  }

  function scMarkHtml(opts) {
    opts = opts || {};
    var mode = opts.mode || 'ripple-s';
    var tone = opts.tone || 'sage';
    var size = opts.size || 28;
    var pulse = opts.pulse ? ' sc-mark--pulse' : '';
    var extra = opts.className ? ' ' + opts.className : '';
    if (!TONE_VARS[tone]) tone = 'sage';

    return (
      '<span class="sc-mark sc-mark--' +
      size +
      ' sc-mark--' +
      tone +
      ' sc-mark--' +
      mode +
      pulse +
      extra +
      '" aria-hidden="true">' +
      '<svg class="sc-mark__svg" viewBox="0 0 1024 1024" focusable="false">' +
      svgRings(mode) +
      svgCore(mode) +
      svgS(mode) +
      '</svg></span>'
    );
  }

  function readToneFromDoc() {
    var el = document.documentElement;
    var t = el && el.getAttribute('data-sc-tone');
    if (t && TONE_VARS[t]) return t;
    return 'sage';
  }

  function upgradeDataMarks() {
    document.querySelectorAll('[data-sc-mark]').forEach(function (el) {
      if (el.getAttribute('data-sc-upgraded') === '1') return;
      var mode = el.getAttribute('data-sc-mark') || 'ripple-s';
      var tone = el.getAttribute('data-sc-tone') || readToneFromDoc();
      var size = parseInt(el.getAttribute('data-sc-size') || '28', 10);
      var pulse = el.hasAttribute('data-sc-pulse');
      var wrap = document.createElement('div');
      wrap.innerHTML = scMarkHtml({ mode: mode, tone: tone, size: size, pulse: pulse }).trim();
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
