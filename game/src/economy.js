// Money between rounds: kills and objectives pay, round wins pay more than
// losses, and a losing streak grows the loss bonus. The buy menu spends it.
import { WEAPONS } from './weapons.js';

export const PRICES = {
  kevlar: 650,
  frag: 300,
};
for (const [kind, def] of Object.entries(WEAPONS)) PRICES[kind] = def.price;

export function createEconomy(state) {
  function lossBonus(streak) {
    return [1900, 2400, 2900, 3400][Math.min(streak, 3)];
  }

  return {
    prices: PRICES,
    roundReward(won) {
      if (won) {
        state.money += 3250;
        state.lossStreak = 0;
      } else {
        state.money += lossBonus(state.lossStreak);
        state.lossStreak += 1;
      }
    },
    killReward() {
      state.money += 300;
    },
    objectiveReward() {
      state.money += 300;
    },
    canAfford(kind) {
      return state.money >= PRICES[kind];
    },
    spend(kind) {
      if (!PRICES[kind] || state.money < PRICES[kind]) return false;
      state.money -= PRICES[kind];
      return true;
    },
  };
}
