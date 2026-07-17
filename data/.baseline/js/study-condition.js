(function () {
  'use strict';

  var condition = document.documentElement.getAttribute('data-study-condition');
  if (condition !== 'a' && condition !== 'b') return;

  window.CORDALSUR_STUDY_CONDITION = condition;

  function preserveCondition(anchor) {
    var raw = anchor && anchor.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || /^(?:mailto:|tel:|javascript:)/i.test(raw)) return;

    var target;
    try {
      target = new URL(raw, window.location.href);
    } catch (error) {
      return;
    }

    var currentDirectory = window.location.pathname.replace(/[^/]*$/, '');
    var isGuestPage = target.pathname === currentDirectory ||
      (target.pathname.indexOf(currentDirectory) === 0 && /\.html$/.test(target.pathname));
    if (target.origin !== window.location.origin || !isGuestPage) return;

    target.searchParams.set('condition', condition);
    anchor.setAttribute('href', target.href);
  }

  function prepareLinks(root) {
    var links = root.querySelectorAll ? root.querySelectorAll('a[href]') : [];
    for (var index = 0; index < links.length; index += 1) preserveCondition(links[index]);
  }

  function initialize() {
    prepareLinks(document);
    document.addEventListener('click', function (event) {
      var anchor = event.target.closest && event.target.closest('a[href]');
      if (anchor) preserveCondition(anchor);
    }, true);

    var observer = new MutationObserver(function (records) {
      for (var recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        var nodes = records[recordIndex].addedNodes;
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          var node = nodes[nodeIndex];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('a[href]')) preserveCondition(node);
          prepareLinks(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
