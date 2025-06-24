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
      <input id="newStart" type="number" placeholder="Startbestand">
      <input id="newMin" type="number" placeholder="Mindestbestand">
      <button onclick="doAdd()">Hinzufügen</button>
      <div id="msgAdd" class="msg"></div>
    `;
    return;
  }

  if (sec === 'Entfernen') {
    f.innerHTML = `
      <h4>Artikel entfernen</h4>
      <input id="delName" placeholder="ID oder Name">
      <button onclick="doRemove()">Entfernen</button>
      <div id="msgRemove" class="msg"></div>
    `;
    return;
  }

  if (sec === 'AdminPanel') {
    f.innerHTML = '<h4>Benutzer verwalten</h4><div id="userTable">Lade…</div>';
    loadUsers();
    return;
  }
}

// Verbrauch/Einkauf buchen
async function doBook(type) {
  const name  = document.getElementById('artSelect').value;
  const delta = Number(document.getElementById('menge').value) || 0;
  const msgEl = document.getElementById('msg'); msgEl.innerText = '';
  try {
    const r = await api('book', 'POST', { name, delta: type==='Einkauf'? delta:-delta, type });
    msgEl.innerText = `Neuer Bestand: ${r.newBestand}`;
    refreshBadges();
  } catch(e){
    alert('Fehler: '+e.message);
  }
}

// Artikel hinzufügen
async function doAdd() {
  const artNr = document.getElementById('newNr').value;
  const name  = document.getElementById('newName').value;
  const start = Number(document.getElementById('newStart').value) || 0;
  const mind  = Number(document.getElementById('newMin').value)   || 0;
  try {
    await api('articles','POST',{ artNr, name, startBestand:start, mindestBestand:mind });
    document.getElementById('msgAdd').innerText = 'Artikel hinzugefügt';
    loadArticles();
  } catch(e){ alert(e.message); }
}

// Artikel entfernen
async function doRemove() {
  const key = document.getElementById('delName').value.trim();
  try {
    await api(`articles/${encodeURIComponent(key)}`,'DELETE',{});
    document.getElementById('msgRemove').innerText = 'Artikel entfernt';
    loadArticles();
  } catch(e){ alert(e.message); }
}

// Artikelübersicht
async function loadArticles() {
  const div = document.getElementById('artikelTable');
  div.innerText = 'Lade…';
  try {
    const data = await api('articles');
    let html = '<table><tr><th>ID</th><th>Nr</th><th>Name</th><th>Bestand</th><th>Mindestbestand</th></tr>';
    data.forEach(r => {
      html += `<tr><td>${r.id}</td><td>${r.artNr}</td><td>${r.name}</td><td>${r.bestand}</td><td>${r.mindestBestand}</td></tr>`;
    });
    html += '</table>';
    div.innerHTML = html;
  } catch { div.innerText = 'Fehler'; }
}

// Warnliste anzeigen
async function loadWarnList() {
  const div = document.getElementById('warnTable');
  div.innerText = 'Lade…';
  try {
    const warn = await api('warnlist');
    if (!warn.length){ div.innerText = 'Keine kritischen Artikel.'; return; }
    let html = '<table><tr><th>ID</th><th>Nr</th><th>Name</th><th>Bestand</th><th>Mindestbestand</th></tr>';
    warn.forEach(r => {
      html += `<tr class="warn"><td>${r.id}</td><td>${r.artNr}</td><td>${r.name}</td><td>${r.bestand}</td><td>${r.mindestBestand}</td></tr>`;
    });
    html += '</table>';
    div.innerHTML = html;
  } catch { div.innerText = 'Fehler'; }
}

// Badges aktualisieren
async function refreshBadges(){
  const bv = document.getElementById('badgeVerbrauch'),
        be = document.getElementById('badgeEinkauf');
  if (!bv||!be) return;
  try {
    const b = await api('badges');
    bv.innerText = b.verbrauch;
    be.innerText = b.einkauf;
  } catch {}
}

// === Benutzerverwaltung ===
async function loadUsers() {
  const div = document.getElementById('userTable');
  div.innerText = 'Lade…';
  try {
    const users = await api('users');
    let html = '<table><tr><th>Username</th><th>Rolle</th>'
             +'<th>V</th><th>E</th><th>+</th><th>-</th><th>A</th><th>W</th><th>U</th><th>Save</th><th>Del</th></tr>';
    users.forEach(u => {
      html += `<tr>
        <td><input value="${u.username}" /></td>
        <td><select>
            <option${u.role==='Admin'?' selected':''}>Admin</option>
            <option${u.role==='Manager'?' selected':''}>Manager</option>
            <option${u.role==='Mitarbeiter'?' selected':''}>Mitarbeiter</option>
            <option${u.role==='Leser'?' selected':''}>Leser</option>
          </select></td>
        ${['consume','purchase','addArticle','removeArticle','viewArticles','viewWarnlist','manageUsers']
          .map(p=>`<td><input type="checkbox"${u.permissions[p]?' checked':''}></td>`).join('')}
        <td><button onclick="saveUser(this)">💾</button></td>
        <td><button onclick="deleteUser('${u.username}')">🗑️</button></td>
      </tr>`;
    });
    html += '</table>';
    div.innerHTML = html;
  } catch(e){ div.innerText = e.message; }
}

async function saveUser(btn) {
  const tr = btn.closest('tr');
  const username = tr.children[0].firstElementChild.value;
  const role = tr.children[1].firstElementChild.value;
  const perms = {};
  ['consume','purchase','addArticle','removeArticle','viewArticles','viewWarnlist','manageUsers']
    .forEach((p,i)=> perms[p] = tr.children[2+i].firstElementChild.checked);
  try {
    await api(`users/${encodeURIComponent(username)}`,'PUT',{ role, permissions: perms });
    alert('Gespeichert');
    loadUsers();
  } catch(e){ alert(e.message); }
}

async function deleteUser(username) {
  if(!confirm(`Löschen ${username}?`)) return;
  try {
    await api(`users/${encodeURIComponent(username)}`,'DELETE');
    loadUsers();
  } catch(e){ alert(e.message); }
}

async function createUser() {
  const u = document.getElementById('newUsername').value;
  const p = document.getElementById('newPassword').value;
  const role= document.getElementById('newRole').value;
  const perms = {};
  ['consume','purchase','addArticle','removeArticle','viewArticles','viewWarnlist','manageUsers']
    .forEach(pn=> perms[pn] = document.getElementById('chk_'+pn).checked);
  try {
    await api('users','POST',{ username:u,password:p,role,permissions:perms });
    alert('Angelegt');
    loadUsers();
  } catch(e){ alert(e.message); }
}

async function resetPassword(username) {
  if(!confirm(`Passwort für ${username} zurücksetzen?`)) return;
  try {
    await api(`users/${encodeURIComponent(username)}/reset-password`,'POST');
    alert('Passwort zurückgesetzt auf "Passwort"');
    loadUsers();
  } catch(e){ alert(e.message); }
}
