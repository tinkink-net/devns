import { TYPE_FIELDS } from './records';

export const renderUi = (): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>devns · records</title>
<style>
  :root {
    --bg: #0b0d12;
    --panel: #11151d;
    --input: #0d1117;
    --border: #212936;
    --border-strong: #33415a;
    --text: #e7ecf3;
    --muted: #8593a8;
    --accent: #5b8cff;
    --accent-strong: #3f74f0;
    --danger: #f0616d;
    --ok: #3ecf8e;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f5f6f8;
      --panel: #ffffff;
      --input: #ffffff;
      --border: #e3e6ec;
      --border-strong: #c7cdd8;
      --text: #161b22;
      --muted: #667085;
      --accent: #2f6bff;
      --accent-strong: #1f56e0;
      --danger: #d92d3f;
      --ok: #1f9d63;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 32px 20px 80px; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-right: auto; }
  .brand .logo {
    width: 30px; height: 30px; border-radius: 8px;
    background: linear-gradient(145deg, var(--accent), #8b5cf6);
    display: grid; place-items: center; color: #fff; font-weight: 700; font-family: var(--mono); font-size: 14px;
  }
  .brand h1 { font-size: 18px; margin: 0; letter-spacing: -0.02em; }
  .brand .sub { color: var(--muted); font-size: 12px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 8px; font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--border); background: var(--panel);
    padding: 4px 9px; border-radius: 999px; white-space: nowrap;
  }
  .pill b { color: var(--text); font-weight: 500; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .dot.on { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 20%, transparent); }

  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .toolbar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    padding: 12px 14px; border-bottom: 1px solid var(--border);
  }
  .toolbar .spacer { flex: 1; }
  button { font: inherit; cursor: pointer; border-radius: 8px; transition: background .12s, border-color .12s, color .12s; }
  .btn {
    border: 1px solid var(--border-strong); background: transparent; color: var(--text);
    padding: 7px 12px; font-size: 13px;
  }
  .btn:hover { border-color: var(--accent); color: var(--accent); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  .btn.primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); color: #fff; }
  .btn.primary:disabled { opacity: .45; cursor: default; background: var(--accent); border-color: var(--accent); }
  .btn.ghost { border-color: transparent; color: var(--muted); }
  .btn.ghost:hover { color: var(--text); border-color: var(--border-strong); }
  .dirty { display: none; align-items: center; gap: 6px; color: var(--accent); font-size: 12px; }
  .dirty.show { display: inline-flex; }

  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); font-weight: 600; padding: 9px 12px; border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--panel) 70%, var(--bg));
  }
  tbody td { padding: 4px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .col-name { width: 30%; }
  .col-type { width: 110px; }
  .col-value { width: auto; }
  .col-ttl { width: 90px; }
  .col-act { width: 44px; }
  input, select {
    width: 100%; background: var(--input); color: var(--text);
    border: 1px solid transparent; border-radius: 7px; padding: 7px 9px;
    font-family: var(--mono); font-size: 13px; outline: none;
  }
  input:hover, select:hover { border-color: var(--border); }
  input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  input.name { font-family: var(--sans); }
  select { cursor: pointer; }
  input.invalid { border-color: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 16%, transparent); }
  .del {
    border: 1px solid transparent; background: transparent; color: var(--muted);
    width: 30px; height: 30px; display: grid; place-items: center; font-size: 16px; line-height: 1; border-radius: 7px;
  }
  .del:hover { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
  .fields { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .fields .field { width: auto; flex: 1 1 90px; min-width: 0; }
  .fields .field.num { flex: 0 0 62px; text-align: center; }
  .empty { padding: 34px 16px; text-align: center; color: var(--muted); }
  .empty b { color: var(--text); display: block; margin-bottom: 4px; }
  .hint { color: var(--muted); font-size: 12px; padding: 10px 14px; border-top: 1px solid var(--border); }
  code { font-family: var(--mono); font-size: 12px; color: var(--text); background: var(--input); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; }

  dialog {
    border: 1px solid var(--border-strong); border-radius: 14px; background: var(--panel); color: var(--text);
    padding: 0; width: min(620px, calc(100vw - 32px)); box-shadow: 0 24px 60px rgba(0,0,0,.45);
  }
  dialog::backdrop { background: rgba(0,0,0,.5); backdrop-filter: blur(2px); }
  dialog .body { padding: 20px; display: grid; gap: 12px; }
  dialog h2 { margin: 0; font-size: 16px; }
  dialog p { margin: 0; color: var(--muted); font-size: 13px; }
  textarea {
    width: 100%; min-height: 160px; resize: vertical;
    background: var(--input); color: var(--text); border: 1px solid var(--border); border-radius: 9px;
    padding: 10px 12px; font-family: var(--mono); font-size: 13px; outline: none; line-height: 1.6;
  }
  textarea:focus { border-color: var(--accent); }
  dialog .foot { display: flex; gap: 8px; align-items: center; }
  dialog .foot .spacer { flex: 1; }
  .file { font-size: 12px; color: var(--muted); }
  .toast {
    position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(8px);
    background: var(--panel); border: 1px solid var(--border-strong); color: var(--text);
    padding: 9px 16px; border-radius: 10px; font-size: 13px; opacity: 0; pointer-events: none;
    transition: opacity .18s, transform .18s; box-shadow: 0 10px 30px rgba(0,0,0,.35); z-index: 10;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .toast.err { border-color: color-mix(in srgb, var(--danger) 55%, transparent); }
  @media (max-width: 620px) {
    .col-ttl { display: none; }
    thead .th-ttl, tbody td.cell-ttl { display: none; }
    .wrap { padding: 20px 12px 60px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">d</div>
      <div>
        <h1>devns</h1>
        <div class="sub">Local DNS records</div>
      </div>
    </div>
    <div class="meta">
      <span class="pill"><span class="dot on"></span> DNS <b id="dns-addr">…</b></span>
      <span class="pill">file <b id="records-file">…</b></span>
    </div>
  </header>

  <div class="panel">
    <div class="toolbar">
      <button class="btn" id="add">+ Add record</button>
      <button class="btn" id="import">Import hosts</button>
      <span class="spacer"></span>
      <span class="dirty" id="dirty">● Unsaved changes</span>
      <button class="btn primary" id="save" disabled>Save</button>
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-name">Name</th>
          <th class="col-type">Type</th>
          <th class="col-value">Value</th>
          <th class="col-ttl th-ttl">TTL</th>
          <th class="col-act"></th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
    <div class="hint">
      Answers override the system hosts file. Wildcards like <code>*.dev.local</code> are supported.
      MX and SRV are edited as named fields (priority, weight, port, target) — devns composes the stored value for you.
    </div>
  </div>
</div>

<dialog id="import-dialog">
  <div class="body">
    <h2>Import hosts file</h2>
    <p>Paste <code>/etc/hosts</code> style lines. IPv4 becomes <b>A</b> records, IPv6 becomes <b>AAAA</b>.</p>
    <textarea id="hosts-text" spellcheck="false" placeholder="127.0.0.1   api.dev.local&#10;::1         api.dev.local"></textarea>
    <label class="file">or choose a file: <input type="file" id="hosts-file" accept=".txt,.hosts,text/plain" /></label>
    <div class="foot">
      <span class="spacer"></span>
      <button class="btn ghost" id="import-cancel" type="button">Cancel</button>
      <button class="btn primary" id="import-add" type="button">Add to table</button>
    </div>
  </div>
</dialog>

<div class="toast" id="toast"></div>

<script>
(function () {
  'use strict';

  var TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SRV', 'TXT'];
  var TYPE_FIELDS = ${JSON.stringify(TYPE_FIELDS)};

  var rowsEl = document.getElementById('rows');
  var saveBtn = document.getElementById('save');
  var dirtyEl = document.getElementById('dirty');
  var toastEl = document.getElementById('toast');
  var records = [];
  var seq = 0;

  function uid() {
    seq += 1;
    return 'r' + seq + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('err', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  function setDirty(value) {
    saveBtn.disabled = !value;
    dirtyEl.classList.toggle('show', value);
  }

  function typeOptions(selected) {
    return TYPES.map(function (t) {
      return '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
  }

  function valueCellHtml(record) {
    var specs = TYPE_FIELDS[record.type] || [];
    var fields = record.fields || {};
    var inputs = specs.map(function (spec) {
      var val = fields[spec.key] == null ? '' : fields[spec.key];
      var type = spec.kind === 'number' ? 'number' : 'text';
      var cls = 'field' + (spec.kind === 'number' ? ' num' : '');
      return '<input class="' + cls + '" data-fkey="' + escapeHtml(spec.key) + '" type="' + type + '"' +
        ' placeholder="' + escapeHtml(spec.placeholder || '') + '"' +
        ' aria-label="' + escapeHtml(spec.label) + '" title="' + escapeHtml(spec.label) + '"' +
        ' value="' + escapeHtml(val) + '" spellcheck="false" />';
    }).join('');
    return '<div class="fields">' + inputs + '</div>';
  }

  function rowHtml(record) {
    return '' +
      '<td class="cell-name"><input class="name" data-field="name" placeholder="example.dev" value="' + escapeHtml(record.name) + '" spellcheck="false" /></td>' +
      '<td class="cell-type"><select data-field="type">' + typeOptions(record.type) + '</select></td>' +
      '<td class="cell-value">' + valueCellHtml(record) + '</td>' +
      '<td class="cell-ttl"><input data-field="ttl" type="number" min="0" placeholder="300" value="' + escapeHtml(record.ttl == null ? '' : record.ttl) + '" /></td>' +
      '<td class="cell-act"><button class="del" title="Delete" aria-label="Delete">×</button></td>';
  }

  function render() {
    rowsEl.innerHTML = '';
    if (!records.length) {
      var empty = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'empty';
      td.innerHTML = '<b>No records yet</b>Add a record or import a hosts file to get started.';
      empty.appendChild(td);
      rowsEl.appendChild(empty);
      return;
    }
    records.forEach(function (record) {
      var tr = document.createElement('tr');
      tr.dataset.key = record._key;
      tr.innerHTML = rowHtml(record);
      tr.querySelectorAll('[data-field]').forEach(function (input) {
        input.addEventListener('input', function () {
          record[input.dataset.field] = input.value;
          input.classList.remove('invalid');
          setDirty(true);
        });
        input.addEventListener('change', function () {
          if (input.dataset.field === 'type') {
            record.type = input.value;
            record.fields = {};
            render();
            setDirty(true);
            return;
          }
          record[input.dataset.field] = input.value;
          input.classList.remove('invalid');
          setDirty(true);
        });
      });
      tr.querySelectorAll('[data-fkey]').forEach(function (input) {
        input.addEventListener('input', function () {
          if (!record.fields) record.fields = {};
          record.fields[input.dataset.fkey] = input.value;
          input.classList.remove('invalid');
          setDirty(true);
        });
      });
      tr.querySelector('.del').addEventListener('click', function () {
        records = records.filter(function (r) { return r._key !== record._key; });
        render();
        setDirty(true);
      });
      rowsEl.appendChild(tr);
    });
  }

  function specsFor(record) {
    return TYPE_FIELDS[record.type] || [];
  }

  function fieldFilled(record, key) {
    var v = record.fields ? record.fields[key] : '';
    return String(v == null ? '' : v).trim() !== '';
  }

  function recordComplete(record) {
    var specs = specsFor(record);
    if (String(record.name || '').trim() === '' || !specs.length) return false;
    return specs.every(function (spec) { return fieldFilled(record, spec.key); });
  }

  function collect() {
    var valid = true;
    rowsEl.querySelectorAll('tr[data-key]').forEach(function (tr) {
      var record = records.find(function (r) { return r._key === tr.dataset.key; });
      if (!record) return;
      var specs = specsFor(record);
      var nameFilled = String(record.name || '').trim() !== '';
      var anyField = specs.some(function (spec) { return fieldFilled(record, spec.key); });
      var allFields = specs.length > 0 && specs.every(function (spec) { return fieldFilled(record, spec.key); });
      var badName = !nameFilled && anyField;
      var badFields = nameFilled && !allFields;
      if (badName || badFields) valid = false;
      var nameInput = tr.querySelector('.name');
      if (nameInput) nameInput.classList.toggle('invalid', badName);
      tr.querySelectorAll('[data-fkey]').forEach(function (input) {
        input.classList.toggle('invalid', badFields && !fieldFilled(record, input.dataset.fkey));
      });
    });
    return valid;
  }

  function serialize(record) {
    return {
      id: record.id || undefined,
      name: String(record.name || '').trim(),
      type: record.type,
      fields: record.fields || {},
      ttl: record.ttl === '' || record.ttl == null ? undefined : Number(record.ttl)
    };
  }

  function load() {
    fetch('/api/records')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        records = (data.records || []).map(function (r) {
          return { id: r.id, name: r.name, type: r.type, fields: r.fields || {}, ttl: r.ttl, _key: uid() };
        });
        render();
        setDirty(false);
      })
      .catch(function () { toast('Failed to load records', true); });
  }

  function save() {
    if (!collect()) {
      toast('Fill in the record name and every field', true);
      return;
    }
    var payload = records.filter(recordComplete).map(serialize);
    saveBtn.disabled = true;
    fetch('/api/records', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: payload })
    })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body && result.body.error ? result.body.error : 'Save failed');
        records = (result.body.records || []).map(function (r) {
          return { id: r.id, name: r.name, type: r.type, fields: r.fields || {}, ttl: r.ttl, _key: uid() };
        });
        render();
        setDirty(false);
        toast('Saved ' + records.length + ' record' + (records.length === 1 ? '' : 's'));
      })
      .catch(function (e) {
        setDirty(true);
        toast(e.message || 'Save failed', true);
      });
  }

  document.getElementById('add').addEventListener('click', function () {
    records.push({ name: '', type: 'A', fields: {}, ttl: undefined, _key: uid() });
    render();
    setDirty(true);
    var inputs = rowsEl.querySelectorAll('[data-field="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  saveBtn.addEventListener('click', save);

  // ----- Import -----
  var dialog = document.getElementById('import-dialog');
  var hostsText = document.getElementById('hosts-text');
  document.getElementById('import').addEventListener('click', function () {
    hostsText.value = '';
    dialog.showModal();
    hostsText.focus();
  });
  document.getElementById('import-cancel').addEventListener('click', function () { dialog.close(); });
  document.getElementById('hosts-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { hostsText.value = String(reader.result || ''); };
    reader.readAsText(file);
  });
  document.getElementById('import-add').addEventListener('click', function () {
    var content = hostsText.value;
    if (!content.trim()) { toast('Nothing to import', true); return; }
    fetch('/api/records/parse-hosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var parsed = data.records || [];
        parsed.forEach(function (r) {
          records.push({ name: r.name, type: r.type, fields: r.fields || {}, ttl: r.ttl, _key: uid() });
        });
        render();
        setDirty(true);
        dialog.close();
        toast('Imported ' + parsed.length + ' record' + (parsed.length === 1 ? '' : 's') + ' — review and save');
      })
      .catch(function () { toast('Import failed', true); });
  });

  // ----- Status -----
  fetch('/api/status')
    .then(function (r) { return r.json(); })
    .then(function (s) {
      document.getElementById('dns-addr').textContent = s.dnsHost + ':' + s.dnsPort;
      document.getElementById('records-file').textContent = s.recordsFile;
    })
    .catch(function () {});

  load();
})();
</script>
</body>
</html>
`;
