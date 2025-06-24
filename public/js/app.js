// API-Helper
async function api(path, method = 'GET', body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/' + path, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || res.statusText);
  }
  return res.json();
}

// Login / Logout
async function login() {
  const u = document.getElementById('user').value;
  const p = document.getElementById('pass').value;
  try {
    const data = await api('login', 'POST', { username: u, password: p });
    document.getElementById('rolleDisplay').innerText = `${data.role} (${data.user})`;
    document.getElementById('loginDiv').style.display = 'none';
    document.getElementById('mainDiv').style.display = 'block';
    refreshBadges();
  } catch {
    alert('Login fehlgeschlagen');
  }
}

async function logout() {
  await api('logout', 'POST');
  document.getElementById('mainDiv').style.display = 'none';
  document.getElementById('loginDiv').style.display = 'block';
}

// Navigation & Formular
function go(sec) {
  const f = document.getElementById('actionForm');
  f.innerHTML = '';

  if (sec === 'Verbrauch' || sec === 'Einkauf') {
    f.innerHTML = `
      <h4>${sec}</h4>
      <select id="artSelect"><option>Lade Artikel…</option></select>
      <input id="menge" type="number" placeholder="Menge">
      <button onclick="doBook('${sec}')">${sec} buchen</button>
      <div id="msg" class="msg"></div>
    `;
    api('articles').then(list => {
      const sel = document.getElementById('artSelect');
      sel.innerHTML = '';
      list.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.text  = `${a.id} – ${a.name}`;
        sel.appendChild(opt);
      });
    }).catch(_ => {
      document.getElementById('artSelect').innerHTML = '<option>Fehler</option>';
    });
    return;
  }

  if (sec === 'Artikelübersicht') {
    f.innerHTML = '<h4>Artikelübersicht</h4><div id="artikelTable">Lade…</div>';
    loadArticles();
    return;
  }

  if (sec === 'Warnliste') {
    f.innerHTML = '<h4>Warnliste</h4><div id="warnTable">Lade…</div>';
    loadWarnList();
    return;
  }

  if (sec === 'Hinzufügen') {
    f.innerHTML = `
      <h4>Artikel hinzufügen</h4>
      <input id="newNr" placeholder="Artikelnr.">
      <input id="newName" placeholder="Name">
      <input id="newMenge" type="number" placeholder="Menge">
      <button onclick="addArticle()">Hinzufügen</button>
    `;
    return;
  }

  if (sec === 'Entfernen') {
    f.innerHTML = `
      <h4>Artikel entfernen</h4>
      <select id="delSelect"><option>Lade Artikel…</option></select>
      <button onclick="removeArticle()">Entfernen</button>
    `;
    api('articles').then(list => {
      const sel = document.getElementById('delSelect');
      sel.innerHTML = '';
      list.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.text  = `${a.id} – ${a.name}`;
        sel.appendChild(opt);
      });
    });
    return;
  }

  if (sec === 'AdminPanel') {
    f.innerHTML = `
      <h4>Admin-Panel</h4>
      <label>User:</label>
      <select id="userSelect"><option>Lade User…</option></select>
      <input id="resetPass" placeholder="Neues Passwort">
      <button onclick="resetUserPass()">Passwort zurücksetzen</button>
    `;
    api('users').then(list => {
      const sel = document.getElementById('userSelect');
      sel.innerHTML = '';
      list.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.username;
        opt.text  = u.username;
        sel.appendChild(opt);
      });
    });
    return;
  }
}

// Handlers für Aktionen
async function doBook(type) {
  const name = document.getElementById('artSelect').value;
  const menge = +document.getElementById('menge').value;
  try {
    await api(type.toLowerCase(), 'POST', { name, amount: menge });
    document.getElementById('msg').textContent = 'Gebucht!';
    refreshBadges();
  } catch (e) {
    document.getElementById('msg').textContent = e.message;
  }
}

async function loadArticles() {
  const list = await api('articles');
  const table = document.getElementById('artikelTable');
  table.innerHTML = '<ul>' + list.map(a =>
    `<li>${a.id} – ${a.name}: ${a.quantity}</li>`).join('') + '</ul>';
}

async function loadWarnList() {
  const list = await api('warnlist');
  const table = document.getElementById('warnTable');
  table.innerHTML = '<ul>' + list.map(a =>
    `<li>${a.id} – ${a.name}: nur noch ${a.quantity}</li>`).join('') + '</ul>';
}

async function addArticle() {
  const id = document.getElementById('newNr').value;
  const name = document.getElementById('newName').value;
  const qty = +document.getElementById('newMenge').value;
  await api('add', 'POST', { id, name, quantity: qty });
  go('Artikelübersicht');
}

async function removeArticle() {
  const name = document.getElementById('delSelect').value;
  await api('remove', 'DELETE', { name });
  go('Artikelübersicht');
}

async function resetUserPass() {
  const name = document.getElementById('userSelect').value;
  const pwd  = document.getElementById('resetPass').value;
  await api('admin/reset-password', 'POST', { username: name, newPassword: pwd });
  alert('Passwort zurückgesetzt');
}

// Handler für Change-Password-Formular
if (document.getElementById('changeForm')) {
  document.getElementById('changeForm').addEventListener('submit', e => {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    })
    .then(res => res.json())
    .then(resp => {
      const msg = document.getElementById('msg');
      if (resp.success) {
        msg.textContent = 'Passwort erfolgreich geändert.';
        setTimeout(() => window.location.href = '/', 2000);
      } else {
        msg.textContent = resp.error || 'Fehler';
      }
    });
  });
}
