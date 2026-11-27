import { brickReward, dailyReward, itemIds, items, Wallet, walletKey } from './economy.js';

const element = id => document.getElementById(id);

export class ItemPanel {
  constructor(game, onUse) {
    this.game = game;
    this.onUse = onUse;
    this.wallet = new Wallet();
    this.dialog = element('settings-dialog');
    this.balance = element('wallet-points');
    this.claimButton = element('claim-points');
    this.feedback = element('shop-feedback');
    this.itemFeedback = element('item-feedback');
    this.buttons = itemIds.map((id, index) => this.createControls(id, index + 1));
    this.claimButton.addEventListener('click', () => void this.claim());
    window.addEventListener('storage', event => {
      if (event.key === walletKey || event.key === null) this.refresh();
    });
    this.refresh();
  }

  createControls(id, key) {
    const item = items[id];
    const quick = element('quick-template').content.firstElementChild.cloneNode(true);
    quick.dataset.item = id;
    quick.title = `${item.name}（${key}）${item.description}`;
    quick.querySelector('.item-icon').textContent = item.icon;
    quick.querySelector('.item-name').textContent = item.name;
    quick.querySelector('kbd').textContent = key;
    quick.addEventListener('click', () => void this.use(id));
    element('quick-items').append(quick);

    const row = element('shop-template').content.firstElementChild.cloneNode(true);
    row.dataset.item = id;
    row.querySelector('.item-icon').textContent = item.icon;
    row.querySelector('strong').textContent = item.name;
    row.querySelector('.item-description').textContent = item.description;
    const redeem = row.querySelector('button');
    redeem.textContent = `${item.price} 积分`;
    redeem.addEventListener('click', () => void this.redeem(id));
    element('shop-items').append(row);

    return { id, quick, quickState: quick.querySelector('.item-state'), redeem, stock: row.querySelector('.shop-stock') };
  }

  open() {
    this.feedback.textContent = '';
    this.refresh();
    this.dialog.showModal();
  }

  refresh() {
    this.save = this.wallet.snapshot();
    this.balance.textContent = this.save.points;
    const canClaim = this.wallet.canClaim(this.save);
    this.claimButton.disabled = !canClaim;
    this.claimButton.textContent = canClaim ? `领取 ${dailyReward} 积分` : '今日已领取';
    for (const { id, redeem, stock } of this.buttons) {
      const item = items[id];
      redeem.disabled = this.save.points < item.price;
      redeem.setAttribute('aria-label', `兑换${item.name}，${item.price} 积分${redeem.disabled ? '，余额不足' : ''}`);
      stock.textContent = `库存 ${this.save.stock[id]}`;
    }
    this.updateQuick();
  }

  updateQuick() {
    for (const { id, quick, quickState } of this.buttons) {
      const count = this.save.stock[id];
      const effect = this.game.effects[id];
      const text = effect ? (id === 'shield' ? '已就绪' : `${Math.ceil(effect)} 秒`) : `×${count}`;
      const disabled = !count || !this.game.canUseItem(id);
      if (quick.disabled !== disabled) quick.disabled = disabled;
      const active = String(Boolean(effect));
      if (quick.dataset.active !== active) quick.dataset.active = active;
      if (quickState.textContent !== text) quickState.textContent = text;
    }
  }

  async claim() {
    const claimed = await this.wallet.claim();
    this.refresh();
    this.feedback.textContent = claimed ? `已领取 ${dailyReward} 积分。` : '今天的积分已经领取。';
  }

  async earn(bricks) {
    await this.wallet.award(bricks * brickReward);
    this.refresh();
  }

  async redeem(id) {
    const redeemed = await this.wallet.redeem(id);
    this.refresh();
    this.feedback.textContent = redeemed ? `已兑换 1 个${items[id].name}，可在对局中使用。` : '积分不足。';
  }

  async use(id) {
    if (!this.game.canUseItem(id)) return;
    const effects = this.game.effects;
    const used = await this.wallet.use(id, () => effects === this.game.effects && this.game.useItem(id));
    this.refresh();
    if (used) {
      this.onUse();
      this.itemFeedback.textContent = `已使用${items[id].name}。`;
    }
  }
}
