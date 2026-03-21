export type Lang = "sw" | "en";

const t: Record<string, { sw: string; en: string }> = {
  // Nav
  "nav.dashboard": { sw: "Dashibodi", en: "Dashboard" },
  "nav.history": { sw: "Historia", en: "History" },
  "nav.analytics": { sw: "Uchambuzi", en: "Analytics" },
  "nav.settings": { sw: "Mipangilio", en: "Settings" },

  // Dashboard
  "dashboard.title": { sw: "Luku Yangu", en: "Luku Yangu" },
  "dashboard.today": { sw: "Matumizi ya Leo", en: "Today's Usage" },
  "dashboard.avg7": { sw: "Wastani (siku 7)", en: "Avg (7 days)" },
  "dashboard.spent": { sw: "Matumizi ya Mwezi", en: "Spent This Month" },
  "dashboard.kwh": { sw: "kWh", en: "kWh" },
  "dashboard.units": { sw: "vitengo", en: "units" },
  "dashboard.days": { sw: "siku", en: "days" },

  // Quick log
  "quicklog.title": { sw: "Sajili Usomaji", en: "Log Reading" },
  "quicklog.placeholder": { sw: "Usomaji wa mita (kWh)", en: "Meter reading (kWh)" },
  "quicklog.save": { sw: "Hifadhi", en: "Save" },
  "quicklog.saved": { sw: "Imehifadhiwa!", en: "Saved!" },
  "quicklog.undo": { sw: "Tendua", en: "Undo" },
  "quicklog.note": { sw: "Maelezo (hiari)", en: "Note (optional)" },
  "quicklog.when": { sw: "Wakati (hiari)", en: "Time (optional)" },

  // Time picker presets
  "time.now": { sw: "Sasa hivi", en: "Just now" },
  "time.30min": { sw: "Dakika 30 zilizopita", en: "30 min ago" },
  "time.1h": { sw: "Saa 1 iliyopita", en: "1 hour ago" },
  "time.2h": { sw: "Masaa 2 yaliyopita", en: "2 hours ago" },
  "time.3h": { sw: "Masaa 3 yaliyopita", en: "3 hours ago" },
  "time.6h": { sw: "Masaa 6 yaliyopita", en: "6 hours ago" },
  "time.12h": { sw: "Masaa 12 yaliyopita", en: "12 hours ago" },
  "time.yesterday": { sw: "Jana", en: "Yesterday" },
  "time.custom": { sw: "Chagua wakati...", en: "Pick a time..." },

  // Nudges
  "nudge.lowBalance": {
    sw: "~{units} vitengo vilivyobaki — vitadumu ~{days} siku kwa kiwango chako cha sasa.",
    en: "~{units} units left — lasts ~{days} days at your current rate.",
  },
  "nudge.logReminder": {
    sw: "Hujasajili leo",
    en: "You haven't logged today",
  },
  "nudge.firstReading": {
    sw: "Sajili usomaji wako wa kwanza wa mita kuanza",
    en: "Log your first meter reading to get started",
  },
  "nudge.oneReading": {
    sw: "Salio la sasa: {units} vitengo. Sajili usomaji mwingine kesho kuanza kufuatilia matumizi.",
    en: "Current balance: {units} units. Log another reading tomorrow to start tracking consumption.",
  },
  "nudge.twoReadings": {
    sw: "Umetumia {units} vitengo katika masaa {hours}. Endelea kusajili kwa mienendo ya kila wiki/mwezi.",
    en: "You used {units} units in {hours} hours. Keep logging for weekly/monthly trends.",
  },
  "nudge.burnRate": {
    sw: "Kwa matumizi yako ya sasa (~{rate} kWh/siku), vitengo {units} vilivyobaki vitadumu ~{days} siku",
    en: "At your current usage (~{rate} kWh/day), your {units} remaining units should last ~{days} days",
  },
  "nudge.noPrediction": {
    sw: "Hakuna data ya kutosha — sajili usomaji kila siku kwa siku chache kupata utabiri",
    en: "Not enough data yet — log readings daily for a few days to get predictions",
  },
  "nudge.noPurchases": {
    sw: "Sajili ununuzi wa LUKU kufuatilia matumizi",
    en: "Log a LUKU purchase to track spending",
  },

  // Purchase
  "purchase.title": { sw: "Sajili Ununuzi", en: "Log Purchase" },
  "purchase.units": { sw: "Vitengo vilivyopokelewa (kWh)", en: "Units received (kWh)" },
  "purchase.amount": { sw: "Kiasi kilicholipwa (TZS)", en: "Amount paid (TZS)" },
  "purchase.note": { sw: "Maelezo (hiari)", en: "Note (optional)" },
  "purchase.when": { sw: "Wakati (hiari — sasa kwa chaguo-msingi)", en: "Time (optional — defaults to now)" },
  "purchase.submit": { sw: "Hifadhi", en: "Save" },
  "purchase.logBtn": { sw: "Sajili Ununuzi", en: "Log Purchase" },

  // History
  "history.title": { sw: "Historia", en: "History" },
  "history.readings": { sw: "Usomaji", en: "Readings" },
  "history.purchases": { sw: "Ununuzi", en: "Purchases" },
  "history.delete": { sw: "Futa", en: "Delete" },
  "history.edit": { sw: "Hariri", en: "Edit" },
  "history.save": { sw: "Hifadhi", en: "Save" },
  "history.cancel": { sw: "Ghairi", en: "Cancel" },
  "history.confirmDelete": { sw: "Una uhakika?", en: "Are you sure?" },
  "history.confirmDeleteMsg": {
    sw: "Kitendo hiki hakiwezi kutenduka.",
    en: "This action cannot be undone.",
  },
  "history.consumption": { sw: "Matumizi", en: "Consumption" },
  "history.rate": { sw: "Kiwango", en: "Rate" },
  "history.noReadings": { sw: "Hakuna usomaji bado", en: "No readings yet" },
  "history.noPurchases": { sw: "Hakuna ununuzi bado", en: "No purchases yet" },

  // Analytics
  "analytics.title": { sw: "Uchambuzi", en: "Analytics" },
  "analytics.daily": { sw: "Kila Siku", en: "Daily" },
  "analytics.weekly": { sw: "Kila Wiki", en: "Weekly" },
  "analytics.monthly": { sw: "Kila Mwezi", en: "Monthly" },
  "analytics.cost": { sw: "Gharama", en: "Cost Summary" },
  "analytics.totalMonth": { sw: "Jumla mwezi huu", en: "Total this month" },
  "analytics.avgDay": { sw: "Wastani/siku", en: "Avg/day" },
  "analytics.avgKwh": { sw: "Wastani/kWh", en: "Avg/kWh" },
  "analytics.vsLastMonth": { sw: "vs mwezi uliopita", en: "vs last month" },
  "analytics.changes": { sw: "Mabadiliko ya Matumizi", en: "Usage Changes" },
  "analytics.steady": {
    sw: "Matumizi yako yamekuwa thabiti.",
    en: "Your consumption has been steady.",
  },
  "analytics.needData": {
    sw: "Endelea kusajili — ugunduzi wa mabadiliko utaanza baada ya wiki 5 za data.",
    en: "Keep logging — change detection starts after 5 weeks of data.",
  },
  "analytics.copySummary": { sw: "Nakili Muhtasari kwa AI", en: "Copy Summary for AI" },
  "analytics.copied": {
    sw: "Imenakiliwa! Bandika kwenye Claude, ChatGPT, au mazungumzo yoyote ya AI.",
    en: "Copied! Paste into Claude, ChatGPT, or any AI chat.",
  },
  "analytics.bar": { sw: "Grafu ya Baa", en: "Bar Chart" },
  "analytics.line": { sw: "Grafu ya Mstari", en: "Line Chart" },

  // Settings
  "settings.title": { sw: "Mipangilio", en: "Settings" },
  "settings.meterNo": { sw: "Nambari ya Mita", en: "Meter Number" },
  "settings.export": { sw: "Hamisha Data (CSV)", en: "Export Data (CSV)" },
  "settings.language": { sw: "Lugha", en: "Language" },
  "settings.theme": { sw: "Mandhari", en: "Theme" },
  "settings.dark": { sw: "Giza", en: "Dark" },
  "settings.light": { sw: "Mwanga", en: "Light" },
  "settings.saved": { sw: "Imehifadhiwa!", en: "Saved!" },

  // Install banner
  "install.title": { sw: "Sakinisha Luku Yangu", en: "Install Luku Yangu" },
  "install.message": {
    sw: "Sakinisha kwa ufikiaji wa haraka na vikumbusho vya kila siku.",
    en: "Install for quick access and daily logging reminders.",
  },
  "install.button": { sw: "Sakinisha", en: "Install" },
  "install.settingsBtn": { sw: "Sakinisha Programu", en: "Install App" },
  "install.installed": { sw: "Programu imesanikishwa", en: "App is installed" },
  "install.uninstallHint": {
    sw: "Ondoa kupitia Mipangilio ya simu > Programu > Luku Yangu",
    en: "Uninstall via phone Settings > Apps > Luku Yangu",
  },

  // Reminder
  "reminder.title": { sw: "Kumbusho la Kila Siku", en: "Daily Reminder" },
  "reminder.description": {
    sw: "Pokea kumbusho la kusajili usomaji wa mita kila siku.",
    en: "Get a daily reminder to log your meter reading.",
  },
  "reminder.time": { sw: "Wakati wa kumbusho", en: "Reminder time" },
  "reminder.enabled": { sw: "Kumbusho limewashwa", en: "Reminder enabled" },
  "reminder.disabled": { sw: "Kumbusho limezimwa", en: "Reminder disabled" },
  "reminder.permissionDenied": {
    sw: "Ruhusa ya arifa imekataliwa. Ruhusu arifa kwenye mipangilio ya kivinjari.",
    en: "Notification permission denied. Please allow notifications in browser settings.",
  },
  "reminder.notifTitle": { sw: "Luku Yangu", en: "Luku Yangu" },
  "reminder.notifBody": {
    sw: "Usisahau kusajili usomaji wako wa mita leo!",
    en: "Don't forget to log your meter reading today!",
  },

  // Common
  "common.loading": { sw: "Inapakia...", en: "Loading..." },
  "common.error": { sw: "Hitilafu imetokea", en: "An error occurred" },
  "common.kwhDay": { sw: "kWh/siku", en: "kWh/day" },
  "common.above": { sw: "juu ya", en: "above" },
  "common.below": { sw: "chini ya", en: "below" },
  "common.usual": { sw: "kawaida yako", en: "your usual" },
  "common.weekOf": { sw: "Wiki ya", en: "Week of" },
};

export function tr(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = t[key];
  if (!entry) return key;
  let text = entry[lang] || entry.en || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export default t;
