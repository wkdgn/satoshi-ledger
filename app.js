import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, CATS } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv-SE');
const esc = s => (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const legacyItems = () => JSON.parse(localStorage.getItem('items') || '[]');
let price = null, items = [], unsub = null, user = null;
let viewYM = today().slice(0, 7);   // 보고 있는 달 (예: 2026-11)

/* ---------- 카테고리 ---------- */
function fillCats(){
  $('cat').innerHTML = CATS[$('type').value].map(c => `<option>${c}</option>`).join('');
}
$('type').onchange = fillCats;
fillCats();

/* ---------- 시세 ---------- */
async function loadPrice(){
  try{
    const r = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC');
    price = (await r.json())[0].trade_price;
    $('price').textContent = price.toLocaleString() + '원';
  }catch(e){
    price = null;
    $('price').textContent = '조회 실패 (수동 입력 사용)';
  }
}

/* ---------- 화면 ---------- */
function render(){
  const list = items.filter(i => (i.date || '').startsWith(viewYM));
  let sum = 0, inc = 0, exp = 0;
  list.forEach(i => { sum += i.sats; if (i.sats > 0) inc += i.sats; else exp += i.sats; });
  $('monthLabel').textContent = viewYM.replace('-', '년 ') + '월';
  $('list').innerHTML = list.length ? list.map(i =>
    `<div class="row"><div><span class="tag">${esc(i.category) || '미분류'}</span>${esc(i.memo) || '-'}<br>
      <small>${i.date} · ${i.krw.toLocaleString()}원 @${i.price.toLocaleString()}</small><br>
      <button class="del" data-id="${i.id}">삭제</button></div>
      <div class="${i.sats<0?'out':'in'}">${i.sats.toLocaleString()} sats</div></div>`
  ).join('') : '<p><small>이 달에는 기록이 없어요</small></p>';
  $('sum').textContent = sum.toLocaleString();
  $('inout').textContent = '수입 ' + inc.toLocaleString() + ' / 지출 ' + Math.abs(exp).toLocaleString() + ' sats';
}

function shiftMonth(d){
  const [y, m] = viewYM.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  viewYM = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  render();
}
$('prevM').onclick = () => shiftMonth(-1);
$('nextM').onclick = () => shiftMonth(1);

/* ---------- 로그인 / 회원가입 ---------- */
const msg = t => { $('authMsg').textContent = t; };
const showView = v => {
  $('loginView').style.display = v === 'login' ? 'block' : 'none';
  $('signupView').style.display = v === 'signup' ? 'block' : 'none';
  msg('');
};
const errText = e => ({
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요',
  'auth/email-already-in-use': '이미 가입된 이메일이에요',
  'auth/weak-password': '비밀번호는 6자 이상이어야 해요',
  'auth/invalid-email': '이메일 형식이 올바르지 않아요'
}[e.code] || e.code);

$('toSignup').onclick = () => showView('signup');
$('toLogin').onclick = () => showView('login');

$('login').onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $('lemail').value.trim(), $('lpw').value); msg(''); }
  catch(e){ msg(errText(e)); }
};

$('signup').onclick = async () => {
  const email = $('semail').value.trim();
  const pw = $('spw').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('이메일 형식이 올바르지 않아요 (예: abc@gmail.com)');
  if (pw.length < 6) return msg('비밀번호는 6자 이상이어야 해요');
  if (pw !== $('spw2').value) return msg('비밀번호 확인이 일치하지 않아요');
  try { await createUserWithEmailAndPassword(auth, email, pw); msg(''); }
  catch(e){ msg(errText(e)); }
};

$('logout').onclick = () => signOut(auth);

onAuthStateChanged(auth, u => {
  user = u;
  if (unsub) { unsub(); unsub = null; }
  $('authBox').style.display = u ? 'none' : 'block';
  $('appBox').style.display = u ? 'block' : 'none';
  if (!u) { items = []; render(); showView('login'); return; }
  $('who').textContent = u.email;
  $('upload').style.display = legacyItems().length ? 'block' : 'none';
  const q = query(collection(db, 'users', u.uid, 'entries'), orderBy('createdAt', 'desc'));
  unsub = onSnapshot(q, snap => {
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => alert('데이터를 불러오지 못했어요: ' + err.message));
});

/* ---------- 기록 추가/삭제 ---------- */
$('add').onclick = async () => {
  const p = price || Number($('manual').value);
  const krw = Number($('amount').value);
  if (!p || !krw) return alert('시세와 금액을 확인하세요');
  const sign = Number($('type').value);
  try {
    await addDoc(collection(db, 'users', user.uid, 'entries'), {
      date: today(), krw, price: p,
      sats: sign * Math.round(krw / p * 1e8),
      category: $('cat').value,
      memo: $('memo').value, createdAt: Date.now()
    });
    $('amount').value = ''; $('memo').value = '';
               viewYM = today().slice(0, 7);
  } catch(e){ alert('저장 실패: ' + e.message); }
};

$('list').onclick = async e => {
  const id = e.target.dataset.id;
  if (id && confirm('삭제할까요?')) {
    try { await deleteDoc(doc(db, 'users', user.uid, 'entries', id)); }
    catch(err){ alert('삭제 실패: ' + err.message); }
  }
};

/* ---------- 기존(이 기기) 기록 올리기 ---------- */
$('upload').onclick = async () => {
  const old = legacyItems();
  if (!old.length || !confirm(old.length + '건을 계정으로 올릴까요?')) return;
  try {
    for (let i = 0; i < old.length; i++) {
      const o = old[i];
      await addDoc(collection(db, 'users', user.uid, 'entries'), {
        date: o.date, krw: o.krw, price: o.price, sats: o.sats,
        memo: o.memo || '', createdAt: Date.now() + i
      });
    }
    localStorage.setItem('items_uploaded', localStorage.getItem('items'));
    localStorage.removeItem('items');
    $('upload').style.display = 'none';
  } catch(e){ alert('업로드 실패: ' + e.message); }
};

$('refresh').onclick = loadPrice;
loadPrice();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
