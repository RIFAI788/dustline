// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// kill feed, bomb status and every overlay panel. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS } from './weapons.js';
import { PRICES } from './economy.js';

const COPY = {
  start: { title: 'DUSTLINE', copy: 'Round-based tactical FPS. Plant the spike at A or B, or eliminate the Jackals. First to 5 rounds takes the yard.', action: 'Deploy' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Resume' },
  dead: { title: 'You are down', copy: 'Spectating your team. The round plays on.', action: '' },
  roundWin: { title: 'Round won', copy: '', action: '' },
  roundLose: { title: 'Round lost', copy: '', action: '' },
  matchWin: { title: 'Vanguard takes the yard', copy: '', action: 'Play again' },
  matchLose: { title: 'Jackals hold the yard', copy: '', action: 'Play again' },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const buyPanel = $('buy-panel');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerCopy = $('banner-copy');
  const killfeed = $('killfeed');
  const damage = $('damage');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorFill = $('armor-fill');
  const moneyEl = $('money');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const timerEl = $('timer');
  const scoreVan = $('score-van');
  const scoreJac = $('score-jac');
  const roundNum = $('round-num');
  const killsEl = $('kills');
  const bombStatus = $('bomb-status');
  const grenadeEl = $('grenades');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -1, money: -1, hp: -1, armor: -1, timer: '', score: '', kills: '', weapon: '', nades: -1 };

  function buildBuyMenu() {
    const grid = $('buy-grid');
    grid.innerHTML = '';
    const items = [
      ['rifle', '1'], ['smg', '2'], ['shotgun', '3'], ['dmr', '4'], ['kevlar', '5'], ['frag', '6'],
    ];
    for (const [kind, key] of items) {
      const name = kind === 'kevlar' ? 'Kevlar Vest' : kind === 'frag' ? 'Frag Grenade' : WEAPONS[kind].name;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.kind = kind;
      button.innerHTML = `<span class="buy-key">${key}</span><span class="buy-name">${name}</span><span class="buy-price">$${PRICES[kind]}</span>`;
      button.addEventListener('click', () => callbacks.onBuy(kind));
      grid.appendChild(button);
    }
  }
  buildBuyMenu();

  return {
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp;
      last.armor = armor;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      armorFill.style.width = `${Math.max(0, armor)}%`;
    },
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve && name === last.weapon) return;
      last.mag = mag;
      last.reserve = reserve;
      last.weapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
    },
    setMoney(value) {
      if (value === last.money) return;
      last.money = value;
      moneyEl.textContent = `$${value}`;
    },
    setGrenades(n) {
      if (n === last.nades) return;
      last.nades = n;
      grenadeEl.textContent = n > 0 ? `◉ ${n} frag` : '';
    },
    setTimer(seconds, phase) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('urgent', seconds <= 10 && phase === 'live');
    },
    setScore(van, jac, round) {
      const text = `${van}-${jac} R${round}`;
      if (text === last.score) return;
      last.score = text;
      scoreVan.textContent = String(van);
      scoreJac.textContent = String(jac);
      roundNum.textContent = `Round ${round}`;
    },
    setKills(kills, deaths) {
      const text = `${kills} K / ${deaths} D`;
      if (text === last.kills) return;
      last.kills = text;
      killsEl.textContent = text;
    },
    setBomb(text, urgent = false) {
      bombStatus.textContent = text;
      bombStatus.classList.toggle('urgent', urgent);
    },
    setPlant(progress, label) {
      if (progress <= 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.min(100, progress * 100)}%`;
      plantLabel.textContent = label;
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 140);
    },
    killfeed(text, kind = '') {
      const entry = document.createElement('div');
      entry.className = `feed-entry ${kind}`;
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 4500);
    },
    showBanner(titleText, copyText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerCopy.textContent = copyText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() { banner.hidden = true; },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = data.title || text.title;
      copy.textContent = data.copy || text.copy;
      if (mode === 'dead') {
        play.hidden = true;
      } else {
        play.hidden = false;
        play.textContent = data.action || text.action;
      }
      overlay.hidden = false;
      if (mode !== 'dead') play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    showBuy(open) {
      buyPanel.hidden = !open;
      if (open) {
        for (const button of buyPanel.querySelectorAll('.buy-item')) {
          const kind = button.dataset.kind;
          button.classList.toggle('cant', callbacks.money() < PRICES[kind]);
          button.classList.toggle('owned', callbacks.owned(kind));
        }
      }
    },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
