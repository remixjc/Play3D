export const dailyReward = 120;
export const brickReward = 2;

export const items = {
  wide: { name: '宽幅', icon: '↔', price: 45, seconds: 12, description: '挡板加宽 50%，持续 12 秒。' },
  slow: { name: '缓速', icon: '◷', price: 55, seconds: 10, description: '弹球降速 35%，持续 10 秒。' },
  shield: { name: '护球', icon: '◇', price: 80, description: '在底线自动救回一次漏接的球。' },
};

export const itemIds = Object.keys(items);
export const walletKey = 'prism-break:wallet';

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function quantity(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalize(value) {
  return {
    points: quantity(value?.points),
    claimedOn: /^\d{4}-\d{2}-\d{2}$/.test(value?.claimedOn) ? value.claimedOn : '',
    stock: Object.fromEntries(itemIds.map(id => [id, quantity(value?.stock?.[id])])),
  };
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export class Wallet {
  constructor({ storage = browserStorage(), locks = globalThis.navigator?.locks } = {}) {
    this.storage = storage;
    this.locks = locks;
    this.memory = normalize(null);
  }

  snapshot() {
    if (this.storage) {
      try {
        this.memory = normalize(JSON.parse(this.storage.getItem(walletKey)));
      } catch (error) {
        if (error instanceof SyntaxError) return normalize(null);
        this.storage = null;
      }
    }
    return normalize(this.memory);
  }

  change(edit) {
    const commit = () => {
      const next = this.snapshot();
      if (!edit(next)) return false;
      this.memory = next;
      if (this.storage) {
        try {
          this.storage.setItem(walletKey, JSON.stringify(next));
        } catch {
          this.storage = null;
        }
      }
      return true;
    };
    return this.storage && this.locks ? this.locks.request(walletKey, commit) : Promise.resolve(commit());
  }

  canClaim(save, date = new Date()) {
    return save.claimedOn < localDay(date);
  }

  claim(date = new Date()) {
    return this.change(next => {
      if (!this.canClaim(next, date)) return false;
      next.claimedOn = localDay(date);
      next.points += dailyReward;
      return true;
    });
  }

  award(points) {
    return this.change(next => {
      next.points += points;
      return true;
    });
  }

  redeem(id) {
    return this.change(next => {
      if (next.points < items[id].price) return false;
      next.points -= items[id].price;
      next.stock[id] += 1;
      return true;
    });
  }

  use(id, activate) {
    return this.change(next => {
      if (!next.stock[id] || !activate()) return false;
      next.stock[id] -= 1;
      return true;
    });
  }
}
