// Shop module: items catalog, purchase, and user inventory
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'database.db'));

// Ensure minimal tables used by shop features exist
db.exec(`
  CREATE TABLE IF NOT EXISTS shop_items (
    item_id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    item_description TEXT,
    price_gems INTEGER NOT NULL,
    category TEXT DEFAULT 'cosmetic',
    icon TEXT
  );

  CREATE TABLE IF NOT EXISTS user_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    UNIQUE(user_id, item_id)
  );
`);

// Seed default items if table empty
const itemCount = db.prepare('SELECT COUNT(*) as c FROM shop_items').get().c;
if (itemCount === 0) {
  const seedItems = [
    { id: 'frame_twilight', name: 'Twilight Frame', desc: 'Purple glow profile frame', price: 50, cat: 'frame', icon: 'twilight' },
    { id: 'frame_gold', name: 'Golden Frame', desc: 'Premium gold frame', price: 120, cat: 'frame', icon: 'gold' },
    { id: 'title_champion', name: 'Title: Champion', desc: 'Display title on your profile', price: 80, cat: 'title', icon: 'trophy' },
    { id: 'banner_starry', name: 'Starry Banner', desc: 'Cosmic banner background', price: 70, cat: 'banner', icon: 'star' },
  ];

  const insert = db.prepare(`
    INSERT INTO shop_items (item_id, item_name, item_description, price_gems, category, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const it of seedItems) {
      insert.run(it.id, it.name, it.desc, it.price, it.cat, it.icon);
    }
  });
  tx();
}

export function getShopItems() {
  return db.prepare(`
    SELECT item_id, item_name, item_description, price_gems, category, icon
    FROM shop_items
    ORDER BY price_gems ASC
  `).all();
}

export function getUserInventory(userId) {
  return db.prepare(`
    SELECT ui.item_id, si.item_name, si.item_description, si.category, si.icon, ui.acquired_at
    FROM user_inventory ui
    JOIN shop_items si ON ui.item_id = si.item_id
    WHERE ui.user_id = ?
    ORDER BY ui.acquired_at DESC
  `).all(userId);
}

export function purchaseItem(userId, itemId) {
  if (!userId || !itemId) {
    return { success: false, error: 'Missing fields' };
  }

  const item = db.prepare('SELECT * FROM shop_items WHERE item_id = ?').get(itemId);
  if (!item) {
    return { success: false, error: 'Item not found' };
  }

  const user = db.prepare('SELECT gems FROM users WHERE user_id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Already owned
  const owned = db.prepare('SELECT 1 FROM user_inventory WHERE user_id = ? AND item_id = ?').get(userId, itemId);
  if (owned) {
    return { success: false, error: 'Already owned' };
  }

  if ((user.gems || 0) < item.price_gems) {
    return { success: false, error: 'Insufficient gems' };
  }

  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET gems = gems - ? WHERE user_id = ?').run(item.price_gems, userId);
      db.prepare('INSERT INTO user_inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)')
        .run(userId, itemId, Date.now());
      db.prepare(`
        INSERT INTO transactions (user_id, transaction_type, amount, description, created_at)
        VALUES (?, 'purchase', ?, ?, ?)
      `).run(userId, -item.price_gems, `Purchase: ${item.item_name}`, Date.now());
    });
    tx();
  } catch (err) {
    return { success: false, error: 'Purchase failed' };
  }

  const inventory = getUserInventory(userId);
  return { success: true, item: { id: item.item_id, name: item.item_name }, inventory };
}

export { db };


