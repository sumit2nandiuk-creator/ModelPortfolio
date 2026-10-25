(function () {
  'use strict';

  var tokenInput = document.getElementById('token');
  var loadButton = document.getElementById('load');
  var refreshButton = document.getElementById('refresh');
  var olderButton = document.getElementById('older');
  var records = document.getElementById('records');
  var status = document.getElementById('status');
  var nextCursor = '';
  var loading = false;

  try { tokenInput.value = sessionStorage.getItem('admin.token') || ''; } catch (_) {}

  function setStatus(message, isError) {
    status.textContent = message;
    status.style.color = isError ? '#a34336' : '';
  }

  function addText(parent, tag, className, value) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value == null ? '' : String(value);
    parent.appendChild(el);
    return el;
  }

  function renderRecord(item) {
    var article = document.createElement('article');
    article.className = 'error';
    var head = document.createElement('div');
    head.className = 'error-head';
    addText(head, 'span', 'source', item.source || 'unknown');
    addText(head, 'time', 'time', item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time');
    article.appendChild(head);
    addText(article, 'p', 'message', item.message || 'Unknown error');
    addText(article, 'p', 'path', item.path || 'No page path recorded');
    if (item.details && Object.keys(item.details).length) {
      var details = document.createElement('details');
      addText(details, 'summary', '', 'Technical details');
      var text = Object.keys(item.details).map(function (key) {
        var value = item.details[key];
        return value === undefined || value === null || value === '' ? '' : key + ': ' + String(value);
      }).filter(Boolean).join('\n');
      if (text) addText(details, 'pre', '', text);
      article.appendChild(details);
    }
    records.appendChild(article);
  }

  function fetchPage(append) {
    if (loading) return Promise.resolve();
    var token = tokenInput.value.trim();
    if (!token) {
      setStatus('Enter the admin token to view error records.', true);
      tokenInput.focus();
      return Promise.resolve();
    }
    loading = true;
    loadButton.disabled = true;
    refreshButton.disabled = true;
    olderButton.disabled = true;
    setStatus('Loading error records…');
    if (!append) {
      records.textContent = '';
      nextCursor = '';
    }
    var url = '/api/errors?limit=50' + (append && nextCursor ? '&cursor=' + encodeURIComponent(nextCursor) : '');
    return fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error(body.error || ('Request failed (' + response.status + ')'));
          return body;
        });
      })
      .then(function (body) {
        var list = Array.isArray(body.errors) ? body.errors : [];
        list.forEach(renderRecord);
        nextCursor = body.nextCursor || '';
        olderButton.hidden = !nextCursor;
        setStatus(list.length ? ('Showing ' + records.querySelectorAll('.error').length + ' error record(s).') : (append ? 'No older errors.' : 'No errors have been recorded.'));
        try { sessionStorage.setItem('admin.token', token); } catch (_) {}
      })
      .catch(function (err) {
        setStatus(err.message || 'Could not load error records.', true);
      })
      .then(function () {
        loading = false;
        loadButton.disabled = false;
        refreshButton.disabled = false;
        olderButton.disabled = false;
      });
  }

  loadButton.addEventListener('click', function () { fetchPage(false); });
  refreshButton.addEventListener('click', function () { fetchPage(false); });
  olderButton.addEventListener('click', function () { fetchPage(true); });
  tokenInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') fetchPage(false);
  });
  if (tokenInput.value) fetchPage(false);
})();
