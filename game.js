// --- SEND SCORE TO GOOGLE SHEET ---
function sendScoreToSheet(data) {
  const url = "https://script.google.com/macros/s/AKfycby4EmJtEL7QiMJTed9y9Cf0_CN6wecnwicRj_UASLv017_QYtpOIW3h7VeL-3ZI3U0e/exec"; // replace with your deployed Google Apps Script Web App URL
  fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(data)
  }).catch(err => console.error("Error sending score:", err));
}
// --- PLAYER INFO ---
const SHEET_GET_URL = "https://script.google.com/macros/s/AKfycby4EmJtEL7QiMJTed9y9Cf0_CN6wecnwicRj_UASLv017_QYtpOIW3h7VeL-3ZI3U0e/exec";

function openScoresModal(){
  const modal = document.getElementById('scores-modal');
  const body = document.getElementById('scores-body');
  if (!modal || !body) return;
  modal.hidden = false;
  body.innerHTML = "<p>Loading…</p>";
  fetch(SHEET_GET_URL, { method: "GET" })
    .then(res => res.text())
    .then(text => {
      let data;
      try { data = JSON.parse(text); } catch(e){ body.innerHTML = "<p>Could not load scores.</p>"; return; }
      renderScoresTable(data);
    })
    .catch(() => body.innerHTML = "<p>Could not load scores.</p>");
  // focus close button for accessibility
  const closeBtn = document.getElementById('scores-close');
  if (closeBtn) closeBtn.focus();
}

function closeScoresModal(){
  const modal = document.getElementById('scores-modal');
  if (modal) modal.hidden = true;
}

function renderScoresTable(arr){
  const body = document.getElementById('scores-body');
  if (!body) return;
  if (!Array.isArray(arr) || !arr.length) { body.innerHTML = "<p>No scores yet.</p>"; return; }

  const header = Array.isArray(arr[0]) ? arr[0].map(x => String(x).toLowerCase()) : [];
  const rows = arr.slice(1).filter(r => Array.isArray(r) && r.length);

  function findIndex(...names){
    for (const n of names){
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  }

  // Try to map common headers; fall back to known column order
  const idxTs = findIndex('timestamp', 'time', 'date');
  const idxInit = findIndex('initials', 'name', 'studentname');
  const idxClass = findIndex('classhour', 'class', 'period');
  const idxMand = findIndex('mandate', 'score');
  const idxDom  = findIndex('dominant', 'philosophy', 'result');

  // Prepare latest-first subset
  const latest = rows.slice().reverse().slice(0, 20);

  function fmt(v){
    if (v === undefined || v === null) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  }

  let html = '<table id="scores-table"><thead><tr><th>Date</th><th>Init</th><th>Class</th><th>Mandate</th><th>Philosophy</th></tr></thead><tbody>';
  latest.forEach(r => {
    const ts = idxTs >= 0 ? r[idxTs] : r[0];
    const init = idxInit >= 0 ? r[idxInit] : r[1];
    const klass = idxClass >= 0 ? r[idxClass] : r[2];
    const mand = idxMand >= 0 ? r[idxMand] : r[3];
    const dom = idxDom >= 0 ? r[idxDom] : (r[7] !== undefined ? r[7] : '');
    html += `<tr><td>${fmt(ts)}</td><td>${init || ''}</td><td>${klass || ''}</td><td>${mand || ''}</td><td>${dom || ''}</td></tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}
let playerInitials = "";
let playerClassHour = "";
// --- GAME STATE ---
let mandate = 10;
let tallies = {Confucian:0, Daoist:0, Legalist:0};
let turn = 0;
let lastDelta = 0; // tracks the last mandate change to drive the sidebar readout
let quizCorrect = 0; // counts correct vocabulary answers
let showHints = false;
const askedQuizNodes = new Set();
let chosenPhilosophy = null;
let expandedPhilosophies = new Set();
const glossary = {
  "Mandate of Heaven": "The belief that Heaven and the gods gave rulers the right to rule. If rulers were unjust, the gods could take it away.",
  "Confucian": "Ideas from Confucius about respect, learning, and good behavior.",
  "Daoist": "Ideas from Daoism about peace, nature, and simple living.",
  "Legalist": "Ideas about strict laws and punishments to keep order.",

  // Agriculture, storage, rivers
  "harvest": "The time when farmers pick and collect their crops.",
  "granary": "A storehouse where grain and food are kept safe.",
  "granaries": "Large buildings where grain is stored safely.",
  "dyke": "A wall built to stop a river from flooding.",

  // Government & society
  "court": "The emperor’s government center—advisors, officials, and offices (not a law court).",
  "paperwork": "Forms and records that officials must fill out and keep.",
  "bureaucracy": "A system where officials do the government’s work.",
  "exam halls": "Big rooms where students take tests to become officials.",
  "price controls": "Rules that set the highest or lowest prices people can charge.",
  "inspectors": "Officials who check weights, taxes, and whether rules are followed.",

  // Philosophy & culture
  "ancestor rites": "Ceremonies to honor family members who have died.",
  "ancestor worship": "Honoring family members who have died and asking for help.",
  "royal schools": "Schools run by the rulers to teach classic books and train officials.",
  "duty": "Something you should do because it is your job or responsibility.",
  "character": "A symbol used in writing; it can also mean what kind of person someone is.",

  // Writing systems & materials
  "pictograph": "A drawing or character that stands for an object.",
  "ideograph": "Two or more characters put together to show an idea.",
  "bronze": "A strong metal made from copper and tin.",

  // Big-history anchors
  "Warring States": "A long time when Chinese states fought each other a lot.",
};

const TOTAL_TURNS = 8; // start + 7 rounds

// Sidebar readout phrases (replace numeric 10/10)
const praiseLines = [
  "The Mandate descends closer to your rule.",
  "Omens favor the court today.",
  "Ministers bow with approval.",
  "Trust rises across the provinces.",
  "Banners steady in a kind wind.",
  "Records praise your steady hand."
];
const cautionLines = [
  "The Mandate drifts away for now.",
  "Rumors grow in the markets.",
  "Omens turn cloudy.",
  "Officials trade worried looks.",
  "Petitions pile up at the gate.",
  "The court waits, uneasy."
];
const neutralLines = [
  "The sky watches quietly.",
  "All is steady—for now.",
  "The court waits for your next move."
];
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] }
function currentReadout(){
  if (lastDelta < 0) return pick(praiseLines); // negatives are considered good
  if (lastDelta > 0) return pick(cautionLines); // positives are considered bad
  return pick(neutralLines);
}

function formatDelta(d){ return d>0? `+${d}` : d<0? String(d) : '±0'; }

function updateProgressForNode(nodeId){
  const el = document.getElementById('progress');
  if(!el) return;
  if(nodeId === 'end'){ el.textContent = 'Summary'; return; }
  el.textContent = `Decision ${Math.min(turn+1, TOTAL_TURNS)} of ${TOTAL_TURNS}`;
}

function flashBar(delta){
  const marker = document.getElementById('mandate-marker');
  const legacy = document.getElementById('mandate-bar');
  const deltaEl = document.getElementById('mandate-delta');

  // legacy flash (if old vertical bar exists)
  if (legacy) {
    const cls = delta>0 ? 'flash-good' : delta<0 ? 'flash-bad' : '';
    if (cls) {
      legacy.classList.remove('flash-good','flash-bad');
      void legacy.offsetWidth; // restart animation
      legacy.classList.add(cls);
      setTimeout(()=> legacy.classList.remove(cls), 350);
    }
  }

  // small delta chip near the track
  if (deltaEl) {
    deltaEl.textContent = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : '±0';
    deltaEl.classList.remove('pos','neg','show');
    // Inverted semantics: negatives are good, positives are bad
    if (delta < 0) deltaEl.classList.add('pos');
    else if (delta > 0) deltaEl.classList.add('neg');
    deltaEl.classList.add('show');
    setTimeout(() => deltaEl.classList.remove('show'), 900);
  }
}

function transitionTo(next){
  const gc = document.getElementById('game-container');
  if(!gc){ next(); return; }
  gc.classList.add('fade-out');
  setTimeout(() => {
    next();
    requestAnimationFrame(() => gc.classList.remove('fade-out'));
  }, 220);
}

// Compute decision delta in "bestowed" model: aligned => Mandate descends (negative),
// misaligned => Mandate wanes (positive). Magnitude comes from option's mandate value.
function decisionDelta(opt){
  const guide = chosenPhilosophy || opt.philosophy;
  const aligned = opt.philosophy ? (guide === opt.philosophy) : false;
  let mag = Math.abs(opt.mandate || 0);
  // Ensure aligned choices always move the Mandate at least a little
  if (aligned && mag === 0) mag = 1;
  if (!aligned && mag === 0) return 0;
  return aligned ? -mag : mag;
}

// Robust Fisher–Yates shuffle
function shuffle(list){
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// --- Accessibility helpers ---
function escapeAttr(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}
function addGlossaryA11y(text){
  let result = text;
  for (let word in glossary) {
    const def = escapeAttr(glossary[word]);
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    result = result.replace(
      regex,
      `<span class=\"glossary\" tabindex=\"0\" aria-label=\"${def}\" title=\"${def}\">${word}</span>`
    );
  }
  return result;
}
function toParagraphs(htmlish){
  const parts = String(htmlish).split(/\n\s*\n+/);
  return parts.map(s => `<p>${s.trim()}</p>`).join('');
}
function renderText(s){
  return toParagraphs(addGlossaryA11y(s));
}

// --- Typewriter reveal for problem text ---
function revealProblemText(text, done){
  const el = document.getElementById('text');
  if (!el) { if (done) done(); return; }
  // Respect reduced motion
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.innerHTML = renderText(text); if (done) done(); return; }
  const raw = String(text);
  el.classList.add('typing');
  el.setAttribute('aria-busy','true');
  el.textContent = '';
  let i = 0;
  const speed = 20; // ms per character
  let timer;
  const finish = () => {
    clearInterval(timer);
    el.innerHTML = renderText(text);
    el.classList.remove('typing');
    el.removeAttribute('aria-busy');
    el.removeEventListener('click', finish);
    document.removeEventListener('keydown', onKeySkip, true);
    if (done) done();
  };
  const onKeySkip = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      finish();
    }
  };
  el.addEventListener('click', finish);
  document.addEventListener('keydown', onKeySkip, true);
  timer = setInterval(() => {
    if (i >= raw.length) { finish(); return; }
    el.textContent += raw[i++];
  }, speed);
}

// --- Vocab lightning round helpers ---
function pickOne(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function buildVocabQuestion(termPref){
  const terms = Object.keys(vocabExtra);
  const term = (termPref && vocabExtra[termPref]) ? termPref : pickOne(terms);
  const correct = vocabExtra[term];
  let pool = terms.filter(t => t !== term);
  const wrong1 = vocabExtra[pickOne(pool)];
  pool = pool.filter(t => vocabExtra[t] !== wrong1);
  const wrong2 = vocabExtra[pickOne(pool.length?pool:terms.filter(t=>t!==term))];
  const choices = [correct, wrong1, wrong2];
  const order = shuffle([0,1,2]);
  const shuffled = order.map(i => choices[i]);
  const correctIndex = order.indexOf(0);
  return { term, correctIndex, choices: shuffled };
}
function askVocabFirst(nodeId, done){
  if (askedQuizNodes.has(nodeId)) { done(); return; }
  askedQuizNodes.add(nodeId);
  const host = document.getElementById('quiz');
  if (!host) { done(); return; }
  const optsDiv = document.getElementById('options');
  if (optsDiv) optsDiv.style.display = 'none';
  host.innerHTML = '';
  const teachTerm = (nodeId === 'start') ? 'Mandate of Heaven' : undefined;
  const q = buildVocabQuestion(teachTerm);
  const panel = document.createElement('div');
  panel.className = 'quiz-panel';
  panel.innerHTML = `
    <div class=\"quiz-heading\">Vocabulary Check</div>
    <div class=\"quiz-question\">What is “${q.term}”?</div>
    <div class=\"quiz-choices\"></div>
  `;
  const choicesDiv = panel.querySelector('.quiz-choices');
  q.choices.forEach((text, idx) => {
    const b = document.createElement('button');
    b.textContent = `${idx+1}. ${text}`;
    b.dataset.index = String(idx);
    b.onclick = () => {
      // disable rest
      [...choicesDiv.querySelectorAll('button')].forEach(x=>x.disabled=true);
      const correct = (idx === q.correctIndex);
      const delta = correct ? -1 : 1; // good learning bestows Mandate (descends)
      lastDelta = delta;
      flashBar(delta);
      mandate = Math.max(0, Math.min(10, mandate + delta));
      if (correct) quizCorrect++;
      updateStats();
      const fb = document.createElement('div'); fb.className = 'quiz-feedback';
      const def = vocabExtra[q.term];
      fb.textContent = (correct ? 'Correct! ' : 'Not quite. ') + (def ? `Definition: ${def}` : '');
      const cont = document.createElement('button'); cont.textContent = 'Continue';
      cont.onclick = () => { 
        host.innerHTML=''; 
        if (optsDiv) optsDiv.style.display = '';
        done(); 
      };
      panel.appendChild(fb); panel.appendChild(cont); cont.focus();
    };
    choicesDiv.appendChild(b);
  });
  // Keyboard 1..3
  const onKey=(e)=>{ const n=parseInt(e.key,10); if(!isNaN(n)&&n>=1&&n<=3){ const btn=choicesDiv.querySelector(`button[data-index=\"${n-1}\"]`); if(btn&&!btn.disabled) btn.click(); } };
  document.addEventListener('keydown', onKey, { once:true });
  host.appendChild(panel);
}

// --- VOCABULARY HIGHLIGHT HELPERS ---
function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function findVocabInText(text){
  const found = new Set();
  const hay = String(text).toLowerCase();
  Object.keys(vocabExtra).forEach((term) => {
    const t = term.toLowerCase();
    // Match whole words/phrases, case-insensitive
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(t)}([^A-Za-z0-9_]|$)`, 'i');
    if (pattern.test(hay)) found.add(t);
  });
  return Array.from(found);
}
function highlightGlossaryForText(text){
  const listHost = document.getElementById('vocab-words');
  if (!listHost) return;
  const found = new Set(findVocabInText(text));
  const items = listHost.querySelectorAll('.vocab-word');
  items.forEach(btn => {
    const key = (btn.dataset.term || btn.textContent || '').toLowerCase();
    if (found.has(key)) btn.classList.add('hinted');
    else btn.classList.remove('hinted');
  });
}

function addGlossary(text) {
  let result = text;
  for (let word in glossary) {
    const regex = new RegExp(`\\b${word}\\b`, "g");
    result = result.replace(
      regex,
      `<span class="glossary" title="${glossary[word]}"><strong>${word}</strong></span>`
    );
  }
  return result;
}

// Philosophy hint content for sidebar
const philosophyInfo = {
  Confucian: {
    title: 'Confucian (Respect & Learning)',
    tips: [
      'Follow rules and respect traditions.',
      'Treat people fairly and do your duty.',
      'Pick smart officials who act with respect.'
    ],
  },
  Daoist: {
    title: 'Daoist (Peace & Nature)',
    tips: [
      'Keep life simple, with fewer rules.',
      'Live with nature, not against it.',
      'Let local people fix problems when they can.'
    ],
  },
  Legalist: {
    title: 'Legalist (Order & Law)',
    tips: [
      'Make clear rules and enforce them.',
      'Keep order so everyone is safe.',
      'Punish cheaters and lawbreakers quickly.'
    ],
  },
};

// Short blurbs for teaching notes
const philoShort = {
  Confucian: "respect, duty, and education",
  Daoist: "simplicity, nature, and few rules",
  Legalist: "strict laws, order, and punishments"
};

// Riddle-style hints to help identify which philosophy an option fits
const philoRiddles = {
  Confucian: [
    "Ask elders; follow the rules.",
    "Books first, then action.",
    "Respect and duty bring peace.",
    "Do what is right, not easy.",
    "Learn, serve, set a good example.",
    "Listen to teachers; keep promises.",
    // new
    "Ritual and respect guide the day.",
    "Honor family; serve the state.",
    "Choose the wise; teach the young.",
    "Good rules, good roles, good results.",
    "Set the example; others follow.",
    "Improve yourself before leading others."
  ],
  Daoist: [
    "Be like water; find the easy path.",
    "Less pushing, more flowing.",
    "Simple living, fewer rules.",
    "Work with nature, not against it.",
    "Step back; let villages decide.",
    "Quiet ways calm big storms.",
    // new
    "Flow around the rock.",
    "Let the small solve the small.",
    "Quiet hands, big changes.",
    "Do less, but do it well.",
    "Nature's way is the easy way.",
    "Sit, watch, then act."
  ],
  Legalist: [
    "Clear rules, quick punishments.",
    "Write the law; enforce it.",
    "Order first, feelings later.",
    "Strong walls and strict guards.",
    "Few chances: obey or pay.",
    "Tight control keeps roads safe.",
    // new
    "Law first, then mercy.",
    "One rule for all.",
    "Punish one, teach many.",
    "Strong fences, safe roads.",
    "Orders clear; duty done.",
    "Firm rules keep lines straight."
  ]
};

// Neutral, instructional outcome texts mapped by node and philosophy
const teachingOutcomes = {
  start: {
    Confucian: "Schools reopen and rites resume. Officials praise your respect for order and learning.",
    Daoist: "Taxes ease and fewer new rules calm daily life. Offices go quiet and people handle local matters.",
    Legalist: "Laws are posted and fines are firm. Courts work faster; order rises, but some people feel nervous."
  },
  r1_harvest: {
    Confucian: "Granaries open and temple teams deliver food. Waiving farm tax keeps families afloat.",
    Daoist: "Local trading is open and prices move on their own. Some areas do well, others struggle; the court stays hands‑off.",
    Legalist: "Hidden grain is seized for army stores. Roads stay orderly, but anger grows in villages."
  },
  r2_flood: {
    Legalist: "Thousands work on the river dykes. Repairs hold, though forced labor brings complaints.",
    Confucian: "You lead mourning and send wood and rice. Families feel seen and supported.",
    Daoist: "Two villages move uphill and rebuilding in the floodplain stops. Big cost now to live with the river later."
  },
  r3_exams: {
    Confucian: "Exam halls fill and top scorers become officials. Clear rules help offices run.",
    Daoist: "Low‑use offices close and paperwork drops. Life is easier, but some roles stay unfilled.",
    Legalist: "Army commanders govern provinces. Control tightens; classic texts lose weight."
  },
  r4_border: {
    Daoist: "Talks and trade cool the border. A light peace holds without fighting.",
    Legalist: "More soldiers and new watchtowers guard the line. Raids slow, while taxes rise.",
    Confucian: "A veteran who respects local customs takes command. Morale improves and discipline stays firm."
  },
  r5_corruption: {
    Confucian: "Public hearing, repayment, and removal from office. Trust rises across the province.",
    Legalist: "Jail time and a ban from office. Fear deters cheating, but cooperation dips.",
    Daoist: "Village elders settle the case. Some praise local fairness; others see weak central help."
  },
  r6_trade: {
    Confucian: "Exams guard top jobs and gift rules curb unfair favors. Ranks feel clearer.",
    Daoist: "Cut fees and open fairs. Trade grows as traditions shift.",
    Legalist: "Price caps and inspectors steady markets. Smuggling drops; innovation slows."
  },
  r7_omen: {
    Confucian: "Cleansing at the temple and honesty pledges at offices. The court promises better behavior.",
    Daoist: "Astronomers explain the eclipse and speak to calm crowds. Rumors fade.",
    Legalist: "Fines for rumor‑starters and closures for stalls that spread fear. Order holds as debate grows."
  }
};

function renderPhilosophyCards() {
  const container = document.getElementById('philo-cards');
  if (!container) return;
  container.innerHTML = '';
  ['Confucian','Daoist','Legalist'].forEach((ph) => {
    const data = philosophyInfo[ph];
    const card = document.createElement('div');
    const isActive = chosenPhilosophy === ph;
    const isExpanded = isActive || expandedPhilosophies.has(ph);
    card.className = 'philo-card' + (isActive ? ' active' : '') + (isExpanded ? ' expanded' : '');
    const list = data.tips.map(t => `<li>${t}</li>`).join('');
    card.innerHTML = `<h4>${data.title}</h4><div class="tap-hint">Click to expand</div><ul>${list}</ul>`;
    card.tabIndex = 0;
    card.setAttribute('role','button');
    card.setAttribute('aria-expanded', String(isExpanded));
    // Allow toggling for unchosen cards; chosen stays expanded
    const toggle = () => {
      if (isActive) return;
      if (expandedPhilosophies.has(ph)) expandedPhilosophies.delete(ph); else expandedPhilosophies.add(ph);
      renderPhilosophyCards();
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' ') { e.preventDefault(); toggle(); }});
    container.appendChild(card);
  });
}

function showSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.add('visible');
  renderPhilosophyCards();
}

function hideSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('visible');
  const container = document.getElementById('philo-cards');
  if (container) container.innerHTML = '';
  expandedPhilosophies = new Set();
}

// --- EVENTS ---
// Each node has: text, options[]. Each option has:
// { choice, outcome, mandate: int (-/+/0), philosophy: 'Confucian'|'Daoist'|'Legalist'|undefined, next: nodeId }
const events = {
  start: {
    text:
      "You are the new emperor.\nEveryone is watching your first move.\nThis choice shows your way of ruling. Choose wisely.\n\nWhat will you do first?",
    options: [
      {
        choice: "Restart weekly ancestor rites and reopen royal schools",
        outcome:
          "Teachers start working and ceremonies happen. Scholars are happy with your respect for order.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r1_harvest",
      },
      {
        choice: "Cut small taxes and pause new rules for one month",
        outcome:
          "People feel less pressure. Officials do less, and daily life goes on smoothly.",
        mandate: 1,
        philosophy: "Daoist",
        next: "r1_harvest",
      },
      {
        choice: "Clearly post laws at city gates and fine lawbreakers",
        outcome:
          "Courts work fast and clear. Order grows, but some people feel scared.",
        mandate: 1,
        philosophy: "Legalist",
        next: "r1_harvest",
      },
    ],
  },
  r1_harvest: {
    text:
      "The north has a bad harvest. Food is low in many places.\n\nWhat will you do?",
    options: [
      {
        choice: "Open royal granaries and cancel farm taxes for one year",
        outcome:
          "Food is given out and temples help. People are thankful and stay loyal.",
        mandate: 2,
        philosophy: "Confucian",
        next: "r2_flood",
      },
      {
        choice: "Let village leaders trade freely; no price controls from the court",
        outcome:
          "Some places do okay; others have trouble. The court stays out to avoid mistakes.",
        mandate: 0,
        philosophy: "Daoist",
        next: "r2_flood",
      },
      {
        choice: "Seize hidden grain and send it to army storehouses",
        outcome:
          "Order is kept, but people are unhappy. Rumors say Heaven dislikes harshness in hunger.",
        mandate: -1,
        philosophy: "Legalist",
        next: "r2_flood",
      },
    ],
  },
  r2_flood: {
    text:
      "The Yellow River floods. Dykes break in two areas.\n\nWhat will you do?",
    options: [
      {
        choice: "Send 5,000 workers to rebuild the dykes this week",
        outcome:
          "Many people work hard on the river. The repairs hold, but forced work makes people upset.",
        mandate: 1,
        philosophy: "Legalist",
        next: "r3_exams",
      },
      {
        choice: "Lead mourning rites and send carts of wood and rice to families",
        outcome:
          "You wear mourning clothes and send help with respect. People feel cared for and safe.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r3_exams",
      },
      {
        choice: "Move two villages uphill; stop rebuilding in the floodplain",
        outcome:
          "It costs a lot now, but people move to safer places. Nature is given space.",
        mandate: 0,
        philosophy: "Daoist",
        next: "r3_exams",
      },
    ],
  },
  r3_exams: {
    text:
      "At court, people argue about the future of government.\n\nWhat will you do?",
    options: [
      {
        choice: "Fund exam halls and hire top scorers as officials",
        outcome:
          "Good scholars get jobs. Respect for rules helps run the government well.",
        mandate: 2,
        philosophy: "Confucian",
        next: "r4_border",
      },
      {
        choice: "Close low-use offices and cut paperwork",
        outcome:
          "Less paperwork and fewer orders. Life is easier, but some jobs stay empty.",
        mandate: 0,
        philosophy: "Daoist",
        next: "r4_border",
      },
      {
        choice: "Put army commanders in charge of provinces",
        outcome:
          "Generals get ahead fast. Control is tighter, but old books are ignored.",
        mandate: -1,
        philosophy: "Legalist",
        next: "r4_border",
      },
    ],
  },
  r4_border: {
    text:
      "A tribe at the border tests your defenses. Small fights happen along the line.\n\nWhat will you do?",
    options: [
      {
        choice: "Meet border chiefs; trade horses, tea, and grain for peace",
        outcome:
          "Messengers share tea and horses. A weak peace lasts without fighting.",
        mandate: 1,
        philosophy: "Daoist",
        next: "r5_corruption",
      },
      {
        choice: "Call up 1,000 soldiers and add watchtowers along the line",
        outcome:
          "More soldiers guard the land. Raiders stay away, but taxes go up.",
        mandate: 1,
        philosophy: "Legalist",
        next: "r5_corruption",
      },
      {
        choice: "Appoint a veteran commander who respects local customs",
        outcome:
          "An experienced leader is firm but respectful. Soldiers feel better and work harder.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r5_corruption",
      },
    ],
  },
  r5_corruption: {
    text:
      "A governor is caught stealing money meant for help.\n\nWhat will you do?",
    options: [
      {
        choice: "Hold a public hearing; make him repay silver; remove him from office",
        outcome:
          "The governor is sorry, pays back, and leaves office. People trust you more.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r6_trade",
      },
      {
        choice: "Jail him for three years and ban him from office",
        outcome:
          "Justice is quick and strong. Officials are careful but less friendly.",
        mandate: 0,
        philosophy: "Legalist",
        next: "r6_trade",
      },
      {
        choice: "Let village elders judge the case; send no royal orders",
        outcome:
          "Local elders make a deal. Some think the central government is not helping enough.",
        mandate: -1,
        philosophy: "Daoist",
        next: "r6_trade",
      },
    ],
  },
  r6_trade: {
    text:
      "The southeast grows rich. Merchants get powerful, and some at court worry.\n\nWhat will you do?",
    options: [
      {
        choice: "Require exams for top jobs and limit gifts from merchants",
        outcome:
          "Tests and ceremonies make clear ranks. People think the system is fairer.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r7_omen",
      },
      {
        choice: "Cut market fees and open two new fairs",
        outcome:
          "Markets work freely. Some old ways change, but people have enough food.",
        mandate: 1,
        philosophy: "Daoist",
        next: "r7_omen",
      },
      {
        choice: "Cap prices and send inspectors to check weights and taxes",
        outcome:
          "Smuggling drops and order grows, but new ideas slow and people whisper.",
        mandate: -1,
        philosophy: "Legalist",
        next: "r7_omen",
      },
    ],
  },
  r7_omen: {
    text:
      "A solar eclipse darkens the capital at noon. People whisper about Heaven’s message.\n\nWhat will you do?",
    options: [
      {
        choice: "Hold cleansing rites at the temple; post 'be honest' rules at offices",
        outcome:
          "You fast and pray. The court promises to be good and honest.",
        mandate: 1,
        philosophy: "Confucian",
        next: "end",
      },
      {
        choice: "Have astronomers show how eclipses work and speak to calm crowds",
        outcome:
          "Astronomers explain the sky. Calm words stop fear and rumors.",
        mandate: 1,
        philosophy: "Daoist",
        next: "end",
      },
      {
        choice: "Fine rumor-starters and close stalls that spread fear",
        outcome:
          "Order stays, but some say you ignore signs from Heaven.",
        mandate: -1,
        philosophy: "Legalist",
        next: "end",
      },
    ],
  },
  end: {
    text: "Your fate is being recorded...",
    options: [],
  },
};

// --- ENDINGS ---
const endings = {
  Confucian: {
    high: "Your dynasty grows strong with respect and learning. People remember you as a wise and fair ruler.",
    mid: "Your dynasty lasts but has problems. People respect rules, but not everyone follows them. You are seen as steady but not great.",
    low: "Your dynasty falls apart. Respect and duty were not enough to keep order. People say you tried, but you lost the Mandate of Heaven."
  },
  Daoist: {
    high: "Your dynasty lives simply and peacefully. By staying close to nature, your people survive many troubles. Others see your rule as calm and balanced.",
    mid: "Your dynasty stays alive but barely. Simple ways bring peace but also weakness. Some like your gentle rule, others say you avoided hard choices.",
    low: "Your dynasty fades away. Life was calm, but you could not protect your people from big problems. People say you lived in harmony but lost control."
  },
  Legalist: {
    high: "Your dynasty is strong and feared. Harsh laws bring order, and enemies do not attack. People remember you as powerful but not always kind.",
    mid: "Your dynasty holds on with fear. People obey but don’t love you. Some praise your strength, but others talk about cruelty and trouble.",
    low: "Your dynasty falls down. Fear and punishments kept people in line for a while, but rebellion grew too strong. People say ruling by fear alone cannot last."
  }
};

// --- FUNCTIONS ---
function updateStats() {
  let cappedMandate = Math.max(0, Math.min(10, mandate));

  // New descending-from-top marker
  const marker = document.getElementById("mandate-marker");
  if (marker) {
    // Prefer pixel math so the marker never slides out of view at 0/10
    const track = document.querySelector('.mandate-track');
    let topPx;
    if (track) {
      const trackH = track.clientHeight || 220; // CSS default
      const markH  = marker.clientHeight || 18; // CSS default
      const maxTop = Math.max(0, trackH - markH);
      // 10/10 => 0px (top), 0/10 => maxTop (bottom)
      topPx = Math.round(maxTop * (10 - cappedMandate) / 10);
      marker.style.top = topPx + 'px';
    } else {
      // Fallback to percent (older layout/SSR)
      const topPercent = (10 - cappedMandate) * 10; // 0%..100%
      marker.style.top = topPercent + '%';
    }

    // Color class based on level
    marker.classList.remove('low', 'mid');
    if (cappedMandate >= 8) {
      // default green via CSS
    } else if (cappedMandate >= 4) {
      marker.classList.add('mid');   // amber
    } else {
      marker.classList.add('low');   // red
    }
  }

  // Update ARIA on meter container if present
  const meter = document.querySelector(".mandate-meter");
  if (meter) {
    meter.setAttribute("aria-valuenow", String(cappedMandate));
  }

  // Fallback: legacy vertical bar (if present)
  const bar = document.getElementById("mandate-bar");
  if (bar) {
    bar.style.height = cappedMandate * 10 + "%";
    bar.setAttribute('aria-valuenow', String(cappedMandate));
    if (cappedMandate >= 8) {
      bar.style.backgroundColor = "#2e7d32"; // green
    } else if (cappedMandate >= 4) {
      bar.style.backgroundColor = "#f9a825"; // amber
    } else {
      bar.style.backgroundColor = "#c62828"; // red
    }
  }

  // Textual readout (randomized hype line based on last delta)
  const val = document.getElementById('mandate-value');
  if (val) val.textContent = currentReadout();

  // Philosophy tallies (if present)
  const c = document.getElementById("confucian"); if (c) c.textContent = tallies.Confucian;
  const d = document.getElementById("daoist"); if (d) d.textContent = tallies.Daoist;
  const l = document.getElementById("legalist"); if (l) l.textContent = tallies.Legalist;
}

function play(nodeId) {
  const node = events[nodeId];
  const textEl = document.getElementById("text");
  const optionsDiv = document.getElementById("options");
  const outcomeHost = document.getElementById("outcome");
  const quizHost = document.getElementById("quiz");
  optionsDiv.innerHTML = "";
  if (outcomeHost) outcomeHost.innerHTML = "";
  if (quizHost) quizHost.innerHTML = "";

  // After text reveal, proceed to render options
  const afterReveal = () => {
    highlightGlossaryForText(node.text);
    if (node.options && node.options.length > 0) {
      const renderOptions = () => {
        const opts = shuffle(node.options);
        opts.forEach((opt, idx) => {
          const row = document.createElement('div');
          row.className = 'option-row';
          const btn = document.createElement("button");
          btn.textContent = `${idx + 1}. ${opt.choice}`;
          btn.dataset.index = String(idx);
          btn.onclick = () => {
            // Prevent multiple clicks on the same button
            if (btn.disabled) return;
            btn.disabled = true;

            const delta = decisionDelta(opt);
            lastDelta = delta;
            flashBar(delta);
            mandate += delta;
            mandate = Math.max(0, Math.min(10, mandate));
            if (opt.philosophy) tallies[opt.philosophy]++;
            turn++;
            updateStats();

            // Set guiding philosophy once, after first choice with a philosophy tag
            if (!chosenPhilosophy && opt.philosophy) {
              chosenPhilosophy = opt.philosophy;
              showSidebar();
            } else {
              // Keep cards in sync with highlight
              renderPhilosophyCards();
            }

            const target = opt.next; // always proceed to next node; finish only on final round

            // Show outcome on the same screen (keep problem + options visible)
            // Disable all options and highlight chosen
            const allBtns = Array.from(optionsDiv.querySelectorAll('button'));
            allBtns.forEach(b => (b.disabled = true));
            btn.classList.add('selected');

            // Build prominent outcome panel
            const host = outcomeHost || optionsDiv; // fallback if placeholder missing
            const panel = document.createElement('div');
            panel.className = 'outcome-panel';
            panel.innerHTML = `
              <div class=\"outcome-heading\">Outcome</div>
              <div class=\"outcome-text\"></div>
              <div class=\"teach-note\" aria-live=\"polite\"></div>
            `;
            const outEl = panel.querySelector('.outcome-text');
            const outcomeText = (teachingOutcomes[nodeId] && teachingOutcomes[nodeId][opt.philosophy]) || opt.outcome;
            if (outEl) outEl.innerHTML = renderText(outcomeText);

            // Teaching note: reference option philosophy vs guiding philosophy
            const teach = panel.querySelector('.teach-note');
            if (teach && opt.philosophy) {
              const guide = chosenPhilosophy || opt.philosophy;
              const aligned = guide === opt.philosophy;
              const optPh = opt.philosophy;
              const guideText = philoShort[guide] || "";
              const optText = philoShort[optPh] || "";
              if (aligned) {
                teach.innerHTML = `This matches your guiding philosophy: <strong>${optPh}</strong> — ${optText}.`;
                panel.classList.add('aligned');
              } else {
                teach.innerHTML = `This action fits <strong>${optPh}</strong> — ${optText}. Your guiding philosophy is <strong>${guide}</strong> — ${guideText}. Staying consistent helps the Mandate.`;
                panel.classList.add('mismatch');
              }
            }

            const cont = document.createElement('button');
            cont.textContent = (target === 'end') ? 'See Summary' : 'Next Decision';
            cont.onclick = () => {
              cont.disabled = true;
              // Auto-hide hints at the end of each round
              showHints = false;
              const hintsBtn = document.getElementById('toggle-hints');
              if (hintsBtn) {
                hintsBtn.textContent = 'Show Hints';
                hintsBtn.setAttribute('aria-pressed','false');
              }
              document.querySelectorAll('#options .hint-line').forEach(el => {
                el.style.display = 'none';
              });
              transitionTo(() => play(target));
            };
            panel.appendChild(cont);
            host.appendChild(panel);
            // Keyboard: Enter or Space to continue
            const onContinueKey = (e) => {
              if (e.key === "Enter" || e.key === " ") {
                cont.click();
              }
            };
            document.addEventListener("keydown", onContinueKey, { once: true });
          };
          // Hint line
          const hint = document.createElement('div');
          hint.className = 'hint-line';
          const src = philoRiddles[opt.philosophy];
          const r = Array.isArray(src) ? pickOne(src) : (src || 'Consider which path this follows.');
          hint.textContent = `Hint: ${r}`;
          hint.style.display = showHints ? 'block' : 'none';

          row.appendChild(btn);
          row.appendChild(hint);
          optionsDiv.appendChild(row);
        });

        // Keyboard access: press 1..n to choose
        const onKey = (e) => {
          const n = parseInt(e.key, 10);
          if (!isNaN(n) && n >= 1 && n <= opts.length) {
            const btn = optionsDiv.querySelector(`button[data-index=\"${n - 1}\"]`);
            if (btn) btn.click();
          }
        };
        document.addEventListener("keydown", onKey, { once: true });
        const firstBtn = optionsDiv.querySelector('button');
        if (firstBtn) firstBtn.focus();
      };

      // Decision options only (vocab already asked before text)
      renderOptions();
    }
  };

  // Ensure vocab check happens before the problem text (only for decision nodes)
  if (node.options && node.options.length > 0) {
    updateProgressForNode(nodeId);
    askVocabFirst(nodeId, () => revealProblemText(node.text, afterReveal));
    return; // prevent any duplicate option rendering below
  }
  updateProgressForNode(nodeId);

  if (!(node.options && node.options.length > 0)) {
    if (nodeId === "end") {
      // figure out philosophy + score, show ending and scorecard
      let maxPhilo = Object.keys(tallies).reduce((a, b) =>
        tallies[a] > tallies[b] ? a : b
      );
      const aligned = tallies[maxPhilo];
      // New scoring: aligned choices + vocab correct; win (high) at 12, mid at 8
      const totalScore = aligned + quizCorrect;
      let mandateLevel = totalScore >= 12 ? "high" : totalScore >= 8 ? "mid" : "low";
      let endingText = endings[maxPhilo][mandateLevel];

      // Compute "favor" as how close the Mandate has descended (higher is better)
      const mandateFavor = Math.max(0, Math.min(10, 10 - Math.max(0, Math.min(10, mandate))));
      const favorLine = mandateFavor >= 9
        ? "Mandate is very close to your court."
        : mandateFavor >= 6
          ? "Mandate is close. Keep steady choices."
          : mandateFavor >= 3
            ? "Mandate is still far. Choose carefully."
            : "Mandate is very far. Stability is weak.";

      // Prompt for initials and class hour before sending score
      playerInitials = promptInitialsOnce();
      playerClassHour = promptClassHourOnce();
// --- Class Hour and Initials Normalization Helpers ---
function normalizeClassHour(s){
  if (!s) return '';
  const x = String(s).trim().toLowerCase().replace(/\s+/g,'');
  if (x === '1/2' || x === '1-2' || x === '12') return '1/2';
  if (x === '5/6' || x === '5-6' || x === '56') return '5/6';
  if (x === '7/8' || x === '7-8' || x === '78') return '7/8';
  return '';
}
function promptInitialsOnce(){
  let val = (prompt('Enter your initials:', '') || '').trim().toUpperCase();
  if (!val) val = 'ANON';
  return val;
}
function promptClassHourOnce(){
  let raw = (prompt('Enter your class hour (1/2, 5/6, or 7/8):', '') || '').trim();
  const norm = normalizeClassHour(raw);
  return norm || 'unknown';
}
      // Prepare score data for sending, including initials and class hour
      const resultData = {
        initials: playerInitials,
        classHour: playerClassHour,
        mandate: mandate,            // raw (lower is better)
        mandateFavor: mandateFavor,  // derived (higher is better)
        confucian: tallies.Confucian,
        daoist: tallies.Daoist,
        legalist: tallies.Legalist,
        dominant: maxPhilo,
        ending: endingText
      };
      sendScoreToSheet(resultData);

      // Compose scorecard text
      let scorecard =
        "\n\n--- Dynasty Scorecard ---\n" +
        `Score (Aligned + Vocab): ${Math.min(totalScore,12)}/12\n` +
        `Mandate Favor (closer is better): ${mandateFavor}/10\n` +
        `${favorLine}\n` +
        `Philosophy Points: Confucian ${tallies.Confucian}, Daoist ${tallies.Daoist}, Legalist ${tallies.Legalist}\n` +
        `Dominant Philosophy: ${maxPhilo}`;

      // Badges for kid-friendly completion (based on totalScore)
      const badges = [];
      if (totalScore >= 12) badges.push('Golden Age 🏅');
      else if (totalScore >= 8) badges.push('Near Mandate 🌤️');
      else badges.push('Still Rising ⛅');
      const maxPoints = Math.max(tallies.Confucian, tallies.Daoist, tallies.Legalist);
      if (maxPoints >= 4) {
        if (maxPhilo === 'Confucian') badges.push('Scholar Emperor 🎓');
        if (maxPhilo === 'Daoist') badges.push('Peacemaker 🌿');
        if (maxPhilo === 'Legalist') badges.push('Iron Hand ⚔️');
      }
      const balanced = Math.abs(tallies.Confucian - tallies.Daoist) <= 1 &&
                       Math.abs(tallies.Confucian - tallies.Legalist) <= 1 &&
                       Math.abs(tallies.Daoist - tallies.Legalist) <= 1;
      if (balanced) badges.push('Balanced ⚖️');
      if (badges.length){
        scorecard += '\nBadges: ' + badges.join(' • ');
      }

      textEl.innerHTML = renderText(endingText + scorecard);

      const btn = document.createElement("button");
      btn.textContent = "Play Again";
      btn.onclick = () => {
        transitionTo(() => {
          mandate = 10;
          tallies = {Confucian:0, Daoist:0, Legalist:0};
          turn = 0;
          chosenPhilosophy = null;
          quizCorrect = 0;
          updateStats();
          hideSidebar();
          play("start");
        });
      };
      optionsDiv.appendChild(btn);
    }
  }
}

// --- OPENING FADE ---
window.onload = () => {
  const fade = document.getElementById("fade-screen");
  const btn = document.getElementById("fade-continue");

  const startGame = () => {
    if (fade.style.display === "none") return;
    fade.style.opacity = 0;
    setTimeout(() => {
      fade.style.display = "none";
      play("start");
      updateStats();
    }, 350);
  };

  btn.addEventListener("click", () => {
    startGame();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      startGame();
    }
  });
  if (btn) btn.focus();
  setupVocabCenter();
  // Initialize textual readout before first decision
  updateStats();
  const scoresBtn = document.getElementById('show-scores');
  if (scoresBtn) scoresBtn.addEventListener('click', openScoresModal);

  const closeBtn = document.getElementById('scores-close');
  if (closeBtn) closeBtn.addEventListener('click', closeScoresModal);

  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('scores-modal');
    if (modal && !modal.hidden && e.key === 'Escape') {
      closeScoresModal();
    }
  });

  // Hints toggle
  const hintsBtn = document.getElementById('toggle-hints');
  if (hintsBtn) {
    const updateLabel = () => {
      hintsBtn.textContent = showHints ? 'Hide Hints' : 'Show Hints';
      hintsBtn.setAttribute('aria-pressed', showHints ? 'true' : 'false');
      document.querySelectorAll('#options .hint-line').forEach(el => {
        el.style.display = showHints ? 'block' : 'none';
      });
    };
    hintsBtn.addEventListener('click', () => { showHints = !showHints; updateLabel(); });
    updateLabel();
  }
};

// --- VOCABULARY CENTER LIST ---
const vocabExtra = {
  ...glossary,
  "emperor": "The ruler of an empire or dynasty.",
  "dynasty": "A family of rulers who rule for many years.",
  "philosophy": "A set of ideas about how people should live and rule.",
  "army": "A large group of soldiers.",
  "tax": "Money people pay to the government.",
  "minister": "A government helper or leader.",
  "market": "A place where people buy and sell goods.",
  "law": "A rule made by the government."
};

function setupVocabCenter(){
  const listHost = document.getElementById('vocab-words');
  const defHost = document.getElementById('vocab-definition');
  if (!listHost || !defHost) return;
  listHost.innerHTML = '';
  const terms = Object.keys(vocabExtra).sort((a,b)=>a.localeCompare(b));
  terms.forEach(term => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vocab-word';
    b.textContent = term;
    b.dataset.term = term.toLowerCase();
    b.onclick = () => {
      // set active state
      [...listHost.querySelectorAll('.vocab-word')].forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      defHost.innerHTML = `<strong>${term}</strong>: ${vocabExtra[term]}`;
    };
    listHost.appendChild(b);
  });
}
