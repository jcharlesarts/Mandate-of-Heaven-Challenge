// --- SEND SCORE TO GOOGLE SHEET ---
function sendScoreToSheet(data) {
  const url = "YOUR_SCRIPT_URL_HERE"; // replace with your deployed Google Apps Script Web App URL
  fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(data)
  }).catch(err => console.error("Error sending score:", err));
}
// --- GAME STATE ---
let mandate = 5;
let tallies = {Confucian:0, Daoist:0, Legalist:0};
let turn = 0;
let chosenPhilosophy = null;
let expandedPhilosophies = new Set();
const glossary = {
  "Mandate of Heaven": "The belief that Heaven gave rulers the right to rule. If rulers were unjust, Heaven could take it away.",
  "Confucian": "Ideas from Confucius about respect, learning, and good behavior.",
  "Daoist": "Ideas from Daoism about peace, nature, and simple living.",
  "Legalist": "Ideas about strict laws and punishments to keep order.",
  "granary": "A storehouse where grain and food are kept safe.",
  "dyke": "A wall built to stop a river from flooding."
};
const TOTAL_TURNS = 8; // start + 7 rounds

function formatDelta(d){ return d>0? `+${d}` : d<0? String(d) : '±0'; }

function updateProgressForNode(nodeId){
  const el = document.getElementById('progress');
  if(!el) return;
  if(nodeId === 'end'){ el.textContent = 'Summary'; return; }
  el.textContent = `Decision ${Math.min(turn+1, TOTAL_TURNS)} of ${TOTAL_TURNS}`;
}

function flashBar(delta){
  const fill = document.getElementById('mandate-bar');
  if(!fill) return;
  const cls = delta>0 ? 'flash-good' : delta<0 ? 'flash-bad' : '';
  if(!cls) return;
  fill.classList.remove('flash-good','flash-bad');
  void fill.offsetWidth; // restart animation
  fill.classList.add(cls);
  setTimeout(()=> fill.classList.remove(cls), 350);
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
      "You are the new emperor.\nPeople are watching to see how you will rule in your first year.\nWhat philosophy will you choose to guide you?",
    options: [
      {
        choice: "You choose to honor rites and support schools",
        outcome:
          "Teachers start working and ceremonies happen. Scholars are happy with your respect for order.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r1_harvest",
      },
      {
        choice: "You decide to lower taxes and let life flow",
        outcome:
          "People feel less pressure. Officials do less, and daily life goes on smoothly.",
        mandate: 1,
        philosophy: "Daoist",
        next: "r1_harvest",
      },
      {
        choice: "You make strict laws and punishments",
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
        choice: "You open granaries and cancel taxes for the year",
        outcome:
          "Food is given out and temples help. People are thankful and stay loyal.",
        mandate: 2,
        philosophy: "Confucian",
        next: "r2_flood",
      },
      {
        choice: "You trust local groups and let markets fix things",
        outcome:
          "Some places do okay; others have trouble. The court stays out to avoid mistakes.",
        mandate: 0,
        philosophy: "Daoist",
        next: "r2_flood",
      },
      {
        choice: "You punish hoarders and take grain for the army",
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
        choice: "You send workers to fix the dykes right away",
        outcome:
          "Many people work hard on the river. The repairs hold, but forced work makes people upset.",
        mandate: 1,
        philosophy: "Legalist",
        next: "r3_exams",
      },
      {
        choice: "You lead ceremonies and help people who lost homes",
        outcome:
          "You wear mourning clothes and send help with respect. People feel cared for and safe.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r3_exams",
      },
      {
        choice: "You move villages and let the river find its way",
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
        choice: "You give money to schools and promote learned officials",
        outcome:
          "Good scholars get jobs. Respect for rules helps run the government well.",
        mandate: 2,
        philosophy: "Confucian",
        next: "r4_border",
      },
      {
        choice: "You cut offices and make government simpler",
        outcome:
          "Less paperwork and fewer orders. Life is easier, but some jobs stay empty.",
        mandate: 0,
        philosophy: "Daoist",
        next: "r4_border",
      },
      {
        choice: "You pick loyal commanders instead of scholars",
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
        choice: "You open talks and trade gifts to ease tension",
        outcome:
          "Messengers share tea and horses. A weak peace lasts without fighting.",
        mandate: 1,
        philosophy: "Daoist",
        next: "r5_corruption",
      },
      {
        choice: "You call up soldiers and build stronger walls",
        outcome:
          "More soldiers guard the land. Raiders stay away, but taxes go up.",
        mandate: 1,
        philosophy: "Legalist",
        next: "r5_corruption",
      },
      {
        choice: "You put a trusted, learned commander in charge",
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
        choice: "You make the governor confess, pay back money, and leave",
        outcome:
          "The governor is sorry, pays back, and leaves office. People trust you more.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r6_trade",
      },
      {
        choice: "You punish the governor to stop others from stealing",
        outcome:
          "Justice is quick and strong. Officials are careful but less friendly.",
        mandate: 0,
        philosophy: "Legalist",
        next: "r6_trade",
      },
      {
        choice: "You let local leaders handle it without your help",
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
        choice: "You set rules and raise merit over money",
        outcome:
          "Tests and ceremonies make clear ranks. People think the system is fairer.",
        mandate: 1,
        philosophy: "Confucian",
        next: "r7_omen",
      },
      {
        choice: "You let trade happen with few rules",
        outcome:
          "Markets work freely. Some old ways change, but people have enough food.",
        mandate: 1,
        philosophy: "Daoist",
        next: "r7_omen",
      },
      {
        choice: "You limit merchants and give power to inspectors",
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
        choice: "You hold cleansing rites and issue moral rules",
        outcome:
          "You fast and pray. The court promises to be good and honest.",
        mandate: 1,
        philosophy: "Confucian",
        next: "end",
      },
      {
        choice: "You explain it’s natural and calm the people",
        outcome:
          "Astronomers explain the sky. Calm words stop fear and rumors.",
        mandate: 1,
        philosophy: "Daoist",
        next: "end",
      },
      {
        choice: "You stop rumors and punish those who spread fear",
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
  const bar = document.getElementById("mandate-bar");
  // Vertical bar: use height instead of width
  if (bar) { bar.style.height = cappedMandate * 10 + "%"; bar.setAttribute('aria-valuenow', String(cappedMandate)); }
  if (cappedMandate >= 8) {
    bar && (bar.style.backgroundColor = "#2e7d32"); // green
  } else if (cappedMandate >= 4) {
    bar && (bar.style.backgroundColor = "#f9a825"); // amber
  } else {
    bar && (bar.style.backgroundColor = "#c62828"); // red
  }
  const val = document.getElementById('mandate-value');
  if (val) val.textContent = `${cappedMandate}/10`;
  const c = document.getElementById("confucian"); if (c) c.textContent = tallies.Confucian;
  const d = document.getElementById("daoist"); if (d) d.textContent = tallies.Daoist;
  const l = document.getElementById("legalist"); if (l) l.textContent = tallies.Legalist;
}

function play(nodeId) {
  const node = events[nodeId];
  const textEl = document.getElementById("text");
  const optionsDiv = document.getElementById("options");
  const outcomeHost = document.getElementById("outcome");
  optionsDiv.innerHTML = "";
  if (outcomeHost) outcomeHost.innerHTML = "";

  textEl.innerHTML = renderText(node.text);
  updateProgressForNode(nodeId);

  if (node.options && node.options.length > 0) {
    const opts = shuffle(node.options);
    opts.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.textContent = `${idx + 1}. ${opt.choice}`;
      btn.dataset.index = String(idx);
      btn.onclick = () => {
        // Prevent multiple clicks on the same button
        if (btn.disabled) return;
        btn.disabled = true;

        flashBar(opt.mandate);
        mandate += opt.mandate;
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

        const target = mandate <= 0 || mandate >= 10 ? "end" : opt.next;

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
          <div class="outcome-heading">Outcome</div>
          <div class="outcome-text">${addGlossary(opt.outcome)}</div>
        `;
        const outEl = panel.querySelector('.outcome-text');
        if (outEl) outEl.innerHTML = renderText(opt.outcome);

        const cont = document.createElement('button');
        cont.textContent = (target === 'end') ? 'See Summary' : 'Next Decision';
        cont.onclick = () => {
          cont.disabled = true;
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
      optionsDiv.appendChild(btn);
    });

    // Keyboard access: press 1..n to choose
    const onKey = (e) => {
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= opts.length) {
        const btn = optionsDiv.querySelector(`button[data-index="${n - 1}"]`);
        if (btn) btn.click();
      }
    };
    document.addEventListener("keydown", onKey, { once: true });
    const firstBtn = optionsDiv.querySelector('button');
    if (firstBtn) firstBtn.focus();
  } else {
    if (nodeId === "end") {
      // figure out philosophy + mandate level, show ending and scorecard
      let maxPhilo = Object.keys(tallies).reduce((a, b) =>
        tallies[a] > tallies[b] ? a : b
      );
      let mandateLevel = mandate >= 8 ? "high" : mandate >= 4 ? "mid" : "low";
      let endingText = endings[maxPhilo][mandateLevel];

      // Prepare score data for sending
      const resultData = {
        mandate: mandate,
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
        `Final Mandate: ${mandate}/10\n` +
        `Philosophy Points: Confucian ${tallies.Confucian}, Daoist ${tallies.Daoist}, Legalist ${tallies.Legalist}\n` +
        `Dominant Philosophy: ${maxPhilo}`;

      // Badges for kid-friendly completion
      const badges = [];
      if (mandate >= 9) badges.push('Golden Age 🏅');
      else if (mandate <= 3) badges.push('Survivor 💪');
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
          mandate = 5;
          tallies = {Confucian:0, Daoist:0, Legalist:0};
          turn = 0;
          chosenPhilosophy = null;
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
  // Ensure Mandate bar starts centered (5/10) behind intro
  updateStats();

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
    b.onclick = () => {
      // set active state
      [...listHost.querySelectorAll('.vocab-word')].forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      defHost.innerHTML = `<strong>${term}</strong>: ${vocabExtra[term]}`;
    };
    listHost.appendChild(b);
  });
}
