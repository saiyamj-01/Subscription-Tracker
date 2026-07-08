import React, { useState, useEffect } from "react";

const uid = () =>
  "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

function monthlyEquivalent(sub) {
  return sub.cycle === "yearly" ? sub.amount / 12 : sub.amount;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function relativeLabel(days) {
  if (days < 0) return Math.abs(days) + "d overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return "in " + days + "d";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Safe storage wrapper.
//
// `window.storage` is a Claude-artifact-only API (only exists inside the
// Claude.ai preview sandbox). On a real site it's undefined, so calling it
// directly throws "Cannot read properties of undefined". This wrapper uses
// window.storage when present, and transparently falls back to
// localStorage (or an in-memory object as a last resort) everywhere else.
// ---------------------------------------------------------------------------
const memoryFallback = {};

const safeStorage = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
        return await window.storage.get(key, false);
      }
    } catch (err) {
      // fall through to next strategy
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(key);
        return raw === null ? null : { value: raw };
      }
    } catch (err) {
      // localStorage unavailable (e.g. privacy mode), fall through
    }
    return key in memoryFallback ? { value: memoryFallback[key] } : null;
  },
  async set(key, value) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
        return await window.storage.set(key, value, false);
      }
    } catch (err) {
      // fall through
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return { key, value };
      }
    } catch (err) {
      // fall through
    }
    memoryFallback[key] = value;
    return { key, value };
  },
  async delete(key) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.delete === "function") {
        return await window.storage.delete(key, false);
      }
    } catch (err) {
      // fall through
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (err) {
      // fall through
    }
    delete memoryFallback[key];
    return { key, deleted: true };
  },
};

const STORAGE_KEY = "subscriptions";
const NOTIFIED_KEY = "notified-subs";
const THEME_KEY = "theme-preference";
const NOTIFY_WINDOW_DAYS = 4;

// ---------------------------------------------------------------------------
// Scoped CSS — self-contained, no Tailwind or other framework required.
// All selectors are prefixed under .st-root so this can drop into any page
// without clashing with existing styles.
// ---------------------------------------------------------------------------
const CSS = `
html, body {
  margin: 0;
  padding: 0;
}

.st-root {
  --st-bg: #1B222C;
  --st-surface: #232B36;
  --st-line: #333E4C;
  --st-text: #EDEBE4;
  --st-text-dim: #9AA3B0;
  --st-sage: #8FBC94;
  --st-sage-dark: #17251A;
  --st-coral: #E8735B;
  --st-coral-bg: rgba(74,53,48,0.55);
  box-sizing: border-box;
  background: var(--st-bg);
  color: var(--st-text);
  min-height: 100vh;
  width: 100%;
  margin: 0;
  padding: 40px 20px 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
  transition: background 0.15s ease, color 0.15s ease;
}
.st-root *, .st-root *::before, .st-root *::after { box-sizing: border-box; }

.st-root[data-theme="light"] {
  --st-bg: #F7F5EF;
  --st-surface: #FFFFFF;
  --st-line: #DEDACF;
  --st-text: #201C16;
  --st-text-dim: #756F63;
  --st-sage: #4C8C56;
  --st-sage-dark: #F2FBF3;
  --st-coral: #C2492F;
  --st-coral-bg: rgba(194,73,47,0.09);
}

.st-header-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.st-theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--st-surface);
  border: 1px solid var(--st-line);
  border-radius: 999px;
  padding: 5px 5px;
  cursor: pointer;
}
.st-theme-toggle-opt {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--st-text-dim);
  background: transparent;
}
.st-theme-toggle-opt.active {
  background: var(--st-sage);
  color: var(--st-sage-dark);
}

.st-wrap { width: 100%; max-width: 760px; margin: 0 auto; }

.st-eyebrow {
  font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--st-sage);
  margin-bottom: 10px;
}
.st-title {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 600;
  font-size: 32px;
  margin: 0 0 6px;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.st-tagline { color: var(--st-text-dim); font-size: 14px; margin: 0 0 28px; }

.st-banner {
  border: 1px solid var(--st-coral);
  background: var(--st-coral-bg);
  border-radius: 4px;
  padding: 16px 20px;
  margin-bottom: 20px;
}
.st-banner-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.st-banner-label {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--st-coral);
}
.st-link-btn {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  color: var(--st-text-dim);
  text-decoration: underline;
  text-underline-offset: 2px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.st-link-btn:hover { color: var(--st-coral); }
.st-banner-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.st-banner-item { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13.5px; }
.st-banner-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-banner-item-name b { font-weight: 500; color: var(--st-text); }
.st-banner-item-days { margin-left: 8px; font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--st-coral); }

.st-total-band {
  background: var(--st-surface);
  border: 1px solid var(--st-line);
  border-radius: 4px;
  padding: 22px 26px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.st-total-label {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--st-text-dim);
}
.st-total-amount {
  font-family: Georgia, serif;
  font-size: 36px;
  font-weight: 700;
  color: var(--st-text);
}
.st-total-amount span { color: var(--st-sage); }
.st-total-sub {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  color: var(--st-text-dim);
}

.st-form {
  background: var(--st-surface);
  border: 1px solid var(--st-line);
  border-radius: 4px;
  padding: 20px 22px;
  margin-bottom: 28px;
}
.st-form-title {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--st-text-dim);
  margin-bottom: 14px;
}
.st-form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.3fr;
  gap: 10px;
  margin-bottom: 12px;
}
@media (max-width: 640px) {
  .st-form-grid { grid-template-columns: 1fr 1fr; }
  .st-row { grid-template-columns: 1fr auto !important; }
}

.st-field label {
  display: block;
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--st-text-dim);
  margin-bottom: 6px;
}
.st-field input, .st-field select {
  width: 100%;
  background: var(--st-bg);
  border: 1px solid var(--st-line);
  border-radius: 3px;
  padding: 9px 10px;
  color: var(--st-text);
  font-family: inherit;
  font-size: 13.5px;
}
.st-field input:focus, .st-field select:focus {
  outline: 2px solid var(--st-sage);
  outline-offset: 1px;
}

.st-add-btn {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: var(--st-sage);
  color: var(--st-sage-dark);
  border: none;
  padding: 11px 20px;
  border-radius: 3px;
  cursor: pointer;
  font-weight: 600;
}
.st-add-btn:hover { filter: brightness(1.08); }
.st-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.st-form-error { font-size: 12.5px; color: var(--st-coral); margin-top: 4px; }

.st-list-title {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--st-text-dim);
  margin: 0 0 12px;
  display: flex;
  justify-content: space-between;
}

.st-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--st-line);
  border-radius: 3px;
  margin-bottom: 8px;
  background: var(--st-surface);
}
.st-row.urgent { border-color: var(--st-coral); background: var(--st-coral-bg); }

.st-flag { width: 8px; height: 8px; border-radius: 50%; background: var(--st-line); }
.st-row.urgent .st-flag { background: var(--st-coral); }

.st-name-block { min-width: 0; }
.st-name { font-size: 14.5px; font-weight: 500; color: var(--st-text); }
.st-meta { font-family: "IBM Plex Mono", monospace; font-size: 11.5px; color: var(--st-text-dim); margin-top: 2px; }

.st-date {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12.5px;
  color: var(--st-text-dim);
  text-align: right;
  white-space: nowrap;
}
.st-row.urgent .st-date { color: var(--st-coral); font-weight: 600; }

.st-amount {
  font-family: "IBM Plex Mono", monospace;
  font-size: 15px;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  color: var(--st-text);
}

.st-del {
  background: none;
  border: 1px solid var(--st-line);
  color: var(--st-text-dim);
  width: 28px; height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.st-del:hover { border-color: var(--st-coral); color: var(--st-coral); }

.st-empty {
  border: 1px dashed var(--st-line);
  border-radius: 4px;
  padding: 34px 24px;
  text-align: center;
  color: var(--st-text-dim);
  font-size: 13.5px;
}
.st-empty strong { color: var(--st-text); font-family: Georgia, serif; font-size: 16px; display: block; margin-bottom: 6px; }

.st-loading {
  text-align: center;
  color: var(--st-text-dim);
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  padding: 30px 0;
}

.st-footer { margin-top: 20px; text-align: right; }
.st-reset {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  color: var(--st-text-dim);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.st-reset:hover { color: var(--st-coral); }
`;

export default function SubscriptionTracker() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    (async () => {
      try {
        const result = await safeStorage.get(THEME_KEY);
        if (result && result.value) setTheme(result.value);
      } catch (err) {
        // no saved preference yet, default to dark
      }
    })();
  }, []);

  function changeTheme(next) {
    setTheme(next);
    safeStorage.set(THEME_KEY, next).catch(() => {});
  }

  useEffect(() => {
    (async () => {
      try {
        const result = await safeStorage.get(STORAGE_KEY);
        setSubs(result && result.value ? JSON.parse(result.value) : []);
      } catch (err) {
        setSubs([]);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (typeof Notification === "undefined") return;

    (async () => {
      let notifiedMap = {};
      try {
        const result = await safeStorage.get(NOTIFIED_KEY);
        notifiedMap = result && result.value ? JSON.parse(result.value) : {};
      } catch (err) {
        notifiedMap = {};
      }

      const due = subs.filter((s) => {
        const d = daysUntil(s.nextDate);
        return d >= 0 && d <= NOTIFY_WINDOW_DAYS;
      });
      if (due.length === 0) return;

      const notify = () => {
        let changed = false;
        due.forEach((s) => {
          if (notifiedMap[s.id] !== todayStr()) {
            try {
              new Notification("Subscription renewing soon", {
                body: `${s.name} renews ${relativeLabel(daysUntil(s.nextDate))} — $${s.amount.toFixed(2)}`,
              });
            } catch (err) {
              // notifications not available in this environment, ignore
            }
            notifiedMap[s.id] = todayStr();
            changed = true;
          }
        });
        if (changed) {
          safeStorage.set(NOTIFIED_KEY, JSON.stringify(notifiedMap)).catch(() => {});
        }
      };

      if (Notification.permission === "granted") {
        notify();
      } else if (Notification.permission === "default") {
        try {
          const perm = await Notification.requestPermission();
          setNotifPermission(perm);
          if (perm === "granted") notify();
        } catch (err) {
          // ignore
        }
      }
    })();
  }, [subs, loading]);

  async function persist(next) {
    setSubs(next);
    try {
      await safeStorage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.error("Failed to save subscriptions", err);
    }
  }

  async function addSub() {
    setError("");
    const trimmedName = name.trim();
    const parsedAmount = parseFloat(amount);

    if (!trimmedName) return setError("Give it a name.");
    if (isNaN(parsedAmount) || parsedAmount <= 0) return setError("Enter a valid amount.");
    if (!nextDate) return setError("Pick the next renewal date.");

    setSaving(true);
    await persist([...subs, { id: uid(), name: trimmedName, amount: parsedAmount, cycle, nextDate }]);
    setSaving(false);
    setName("");
    setAmount("");
    setNextDate("");
  }

  async function removeSub(id) {
    await persist(subs.filter((s) => s.id !== id));
  }

  async function resetAll() {
    if (!window.confirm("Clear all tracked subscriptions? This cannot be undone.")) return;
    setSubs([]);
    try {
      await safeStorage.delete(STORAGE_KEY);
    } catch (err) {
      // key may not exist yet, that's fine
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") addSub();
  }

  const total = subs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  const sorted = [...subs].sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
  const urgentCount = sorted.filter((s) => daysUntil(s.nextDate) <= 7).length;
  const dueForBanner = [...subs]
    .filter((s) => {
      const d = daysUntil(s.nextDate);
      return d >= 0 && d <= NOTIFY_WINDOW_DAYS && !dismissed.includes(s.id);
    })
    .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));

  return (
    <div className="st-root" data-theme={theme}>
      <style>{CSS}</style>
      <div className="st-wrap">
        {/* Header */}
        <div className="st-header-row">
          <div className="st-eyebrow">Ledger · MVP</div>
          <div className="st-theme-toggle" role="group" aria-label="Theme">
            <button
              className={"st-theme-toggle-opt" + (theme === "light" ? " active" : "")}
              onClick={() => changeTheme("light")}
              title="Light mode"
              aria-label="Light mode"
            >
              ☀
            </button>
            <button
              className={"st-theme-toggle-opt" + (theme === "dark" ? " active" : "")}
              onClick={() => changeTheme("dark")}
              title="Dark mode"
              aria-label="Dark mode"
            >
              ☾
            </button>
          </div>
        </div>
        <h1 className="st-title">
          Every subscription.
          <br />
          One running total.
        </h1>
        <p className="st-tagline">
          Track what's actually leaving your account each month — and see what's renewing
          before it does.
        </p>

        {/* Renewal alert banner */}
        {!loading && dueForBanner.length > 0 && (
          <div className="st-banner">
            <div className="st-banner-head">
              <div className="st-banner-label">
                {dueForBanner.length} renewing within {NOTIFY_WINDOW_DAYS} days
              </div>
              {notifPermission !== "granted" && notifPermission !== "unsupported" && (
                <button
                  className="st-link-btn"
                  onClick={() => Notification.requestPermission().then(setNotifPermission)}
                >
                  enable desktop alerts
                </button>
              )}
            </div>
            <ul className="st-banner-list">
              {dueForBanner.map((s) => (
                <li key={s.id} className="st-banner-item">
                  <span className="st-banner-item-name">
                    <b>{s.name}</b>
                    <span className="st-banner-item-days">{relativeLabel(daysUntil(s.nextDate))}</span>
                  </span>
                  <button className="st-link-btn" onClick={() => setDismissed((d) => [...d, s.id])}>
                    dismiss
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Total band */}
        <div className="st-total-band">
          <div>
            <div className="st-total-label">Total monthly spend</div>
            <div className="st-total-amount">
              $<span>{total.toFixed(2)}</span>
            </div>
          </div>
          <div className="st-total-sub">
            {subs.length} {subs.length === 1 ? "subscription" : "subscriptions"} tracked
          </div>
        </div>

        {/* Add form */}
        <div className="st-form">
          <div className="st-form-title">Add a subscription</div>
          <div className="st-form-grid">
            <div className="st-field">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Netflix, Spotify..."
              />
            </div>
            <div className="st-field">
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="15.99"
              />
            </div>
            <div className="st-field">
              <label>Billing cycle</label>
              <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="st-field">
              <label>Next renewal</label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
          {error && <div className="st-form-error">{error}</div>}
          <button className="st-add-btn" onClick={addSub} disabled={saving}>
            Add subscription
          </button>
        </div>

        {/* List header */}
        <div className="st-list-title">
          <span>Upcoming renewals</span>
          <span>
            {loading
              ? ""
              : subs.length === 0
              ? ""
              : urgentCount > 0
              ? `${urgentCount} renewing within 7 days`
              : "all clear this week"}
          </span>
        </div>

        {/* List */}
        {loading ? (
          <div className="st-loading">Loading your subscriptions...</div>
        ) : subs.length === 0 ? (
          <div className="st-empty">
            <strong>Nothing tracked yet</strong>
            Add your first subscription above — recurring charges add up fast once you see them
            all in one place.
          </div>
        ) : (
          <div>
            {sorted.map((sub) => {
              const days = daysUntil(sub.nextDate);
              const urgent = days <= 7;
              return (
                <div key={sub.id} className={"st-row" + (urgent ? " urgent" : "")}>
                  <div className="st-flag" />
                  <div className="st-name-block">
                    <div className="st-name">{sub.name}</div>
                    <div className="st-meta">
                      {sub.cycle === "yearly"
                        ? `billed yearly · $${monthlyEquivalent(sub).toFixed(2)}/mo equiv.`
                        : "billed monthly"}
                    </div>
                  </div>
                  <div className="st-date">
                    {formatDate(sub.nextDate)}
                    <br />
                    {relativeLabel(days)}
                  </div>
                  <div className="st-amount">${sub.amount.toFixed(2)}</div>
                  <button className="st-del" title={`Remove ${sub.name}`} onClick={() => removeSub(sub.id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="st-footer">
          <button className="st-reset" onClick={resetAll}>
            Clear all data
          </button>
        </div>
      </div>
    </div>
  );
}
