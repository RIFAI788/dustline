// The match: buy phase, live round, round end, match end. First to 5 rounds
// takes the yard, at most 9 rounds. A round is won by elimination, by the
// spike exploding, by defusing it, or by the defenders surviving the clock.
import { pick } from './rng.js';

const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const ROUND_END_SECONDS = 5;
const WINS_TO_WIN = 5;
const MAX_ROUNDS = 9;

export function createMatch(deps) {
  const { state, bots, bomb, weapons, economy, hud, audio } = deps;

  function resetPositions() {
    const playerSpawn = pick(state.random, deps.world.spawns.van);
    deps.playerReset(playerSpawn);
    bots.reset();
  }

  function startRound() {
    state.round += state.round === 0 ? 1 : 0;
    resetPositions();
    bomb.reset('player');
    state.grenades = 0;
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.plantT = 0;
    state.defuseT = 0;
    state.visibleEnemies = new Set();
    hud.setScore(state.score.van, state.score.jac, state.round);
    hud.setBomb('Spike with you — plant at A or B');
    hud.showBuy(true);
    hud.hideBanner();
    if (!state.shot) hud.showOverlay('start', { title: `Round ${state.round}`, copy: 'Buy phase — spend your money, then fight.', action: 'Deploy' });
  }

  function startMatch() {
    state.score = { van: 0, jac: 0 };
    state.round = 0;
    state.money = 800;
    state.lossStreak = 0;
    state.kills = 0;
    state.deaths = 0;
    state.matchOver = false;
    weapons.resetToPistol();
    startRound();
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.score[winner] += 1;
    economy.roundReward(winner === 'van');
    const won = winner === 'van';
    hud.setScore(state.score.van, state.score.jac, state.round);
    hud.showBuy(false);
    hud.setPlant(0, '');
    const reasonText = {
      elimination: won ? 'Jackals eliminated.' : 'Vanguard eliminated.',
      explosion: 'The spike detonated at the site.',
      defused: 'The spike was defused.',
      time: 'Time expired — the Jackals hold the sites.',
    }[reason] || '';
    hud.showBanner(won ? 'Round won' : 'Round lost', reasonText, 4200);
    if (won) audio.roundWin();
    else audio.roundLose();
    if (state.score.van >= WINS_TO_WIN || state.score.jac >= WINS_TO_WIN || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchOver = true;
      const matchWon = state.score.van > state.score.jac;
      setTimeout(() => {
        hud.showOverlay(matchWon ? 'matchWin' : 'matchLose', {
          copy: `Final score ${state.score.van} – ${state.score.jac}. ${matchWon ? 'The yard is yours.' : 'The Jackals keep the yard.'}`,
        });
      }, 1200);
      deps.onMatchEnd(matchWon);
      return;
    }
    state.phase = 'roundEnd';
    state.timer = ROUND_END_SECONDS;
    // Death loses the loadout; survivors keep their weapons.
    if (!state.playerAlive) {
      weapons.resetToPistol();
      state.playerArmor = 0;
    } else weapons.refillAmmo();
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        hud.showBuy(false);
        hud.hideOverlay();
        hud.showBanner(`Round ${state.round}`, state.round === 1 ? 'Plant the spike at A or B' : '', 2200);
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      const vanAlive = (state.playerAlive ? 1 : 0) + bots.aliveCount('van');
      const jacAlive = bots.aliveCount('jac');
      if (jacAlive === 0) {
        endRound('van', 'elimination');
        return;
      }
      if (vanAlive === 0) {
        endRound('jac', 'elimination');
        return;
      }
      if (bomb.spike.status === 'exploded') {
        endRound('van', 'explosion');
        return;
      }
      if (bomb.spike.status === 'defused') {
        endRound('jac', 'defused');
        return;
      }
      if (state.timer <= 0 && bomb.spike.status !== 'planted') {
        endRound('jac', 'time');
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.round += 1;
        startRound();
      }
    }
  }

  return { startMatch, startRound, endRound, step, buySeconds: BUY_SECONDS, roundSeconds: ROUND_SECONDS };
}
